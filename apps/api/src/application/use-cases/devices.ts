import { decisionActionFor, type DeviceDecision, type DeviceDecisionAction } from '../../domain/entities/device-decision.js';
import {
  classifyDevice,
  createManualDevice,
  normalizeMac,
  type ClassificationDecision,
  type Device,
  type DeviceLifecycle,
  type ManualDeviceInput,
} from '../../domain/entities/device.js';
import { resolveEvent } from '../../domain/entities/monitoring-event.js';
import { DuplicateDeviceError, NotFoundError, ValidationError } from '../../domain/errors.js';
import { DISCOVERY_KEY } from '../../domain/rules/discovery.js';
import type {
  DeviceDecisionRepository,
  DeviceQuery,
  DeviceRepository,
  EventRepository,
} from '../ports/repositories.js';
import type { Clock, IdGenerator } from '../ports/system.js';

export class ListDevices {
  constructor(private readonly devices: DeviceRepository) {}

  execute(query: DeviceQuery = {}): Promise<Device[]> {
    return this.devices.findAll(query);
  }
}

export class GetDevice {
  constructor(private readonly devices: DeviceRepository) {}

  async execute(id: string): Promise<Device> {
    const device = await this.devices.findById(id);
    if (!device) throw new NotFoundError(`Équipement ${id} introuvable`);
    return device;
  }
}

export class ListDeviceDecisions {
  constructor(private readonly decisions: DeviceDecisionRepository) {}

  execute(deviceId: string, limit = 50): Promise<DeviceDecision[]> {
    return this.decisions.listByDevice(deviceId, limit);
  }
}

/** Trace commune à toutes les actions humaines sur un équipement. */
function decisionFor(
  id: string,
  action: DeviceDecisionAction,
  author: string,
  at: Date,
  previousLifecycle: DeviceLifecycle | null,
  device: Device,
): DeviceDecision {
  return {
    id,
    deviceId: device.id,
    action,
    author,
    decidedAt: at,
    previousLifecycle,
    lifecycle: device.lifecycle,
    kind: device.kind,
    label: device.label,
    critical: device.critical,
  };
}

/**
 * Un utilisateur valide, ignore ou exclut une machine détectée, ou corrige la fiche d'un équipement.
 * C'est la seule façon de sortir de l'état « à valider » ; cela referme l'événement d'ajout
 * et laisse une trace (qui, quoi, quand) dans l'historique de l'équipement.
 */
export class ClassifyDevice {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: EventRepository,
    private readonly decisions: DeviceDecisionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(id: string, decision: ClassificationDecision, author: string): Promise<Device> {
    const device = await this.devices.findById(id);
    if (!device) throw new NotFoundError(`Équipement ${id} introuvable`);
    const now = this.clock.now();

    const classified = classifyDevice(device, decision);
    await this.devices.save(classified);
    await this.decisions.insert(
      decisionFor(
        this.ids.next(),
        decisionActionFor(device.lifecycle, classified.lifecycle),
        author,
        now,
        device.lifecycle,
        classified,
      ),
    );

    const open = await this.events.findOpen();
    const discovery = open.find((e) => e.deviceId === id && e.dedupeKey === DISCOVERY_KEY);
    if (discovery) await this.events.save(resolveEvent(discovery, now));

    return classified;
  }
}

/**
 * « Tout valider » : valide d'un coup chaque machine encore à valider, en conservant le rôle et le nom
 * qu'elle a déjà (à préciser ensuite fiche par fiche). C'est toujours une décision humaine :
 * elle est tracée équipement par équipement, au nom de la personne qui l'a prise.
 */
export class ValidateAllPending {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly classify: ClassifyDevice,
  ) {}

  async execute(author: string): Promise<Device[]> {
    const pending = await this.devices.findAll({ lifecycle: 'pending_classification' });
    const validated: Device[] = [];
    for (const device of pending) {
      validated.push(
        await this.classify.execute(
          device.id,
          { kind: device.kind, label: device.label, critical: device.critical, lifecycle: 'active' },
          author,
        ),
      );
    }
    return validated;
  }
}

export interface CreateDeviceCommand extends ManualDeviceInput {
  author: string;
  /** Équipement déjà connu (même IP ou même MAC) à compléter au lieu d'en créer un second. */
  mergeInto?: string;
}

export interface CreateDeviceResult {
  device: Device;
  /** `false` quand l'ajout a été fusionné avec un équipement existant. */
  created: boolean;
}

/**
 * Ajout manuel d'un équipement que le collecteur ne détecte pas. Un équipement déjà connu
 * à la même IP ou la même MAC n'est jamais dédoublé : l'ajout est refusé (409) en le désignant,
 * et l'utilisateur peut choisir de fusionner, c'est-à-dire de compléter la fiche existante.
 */
export class CreateDevice {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: EventRepository,
    private readonly decisions: DeviceDecisionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateDeviceCommand): Promise<CreateDeviceResult> {
    const known = await this.devices.findAll();
    const now = this.clock.now();

    if (command.mergeInto !== undefined) {
      return { device: await this.merge(command, known, now), created: false };
    }

    const duplicate = findDuplicate(command, known);
    if (duplicate) {
      throw new DuplicateDeviceError(
        `${describeMatch(duplicate.matchedOn)} que l’équipement existant « ${displayName(duplicate.device)} » ` +
          `(${lifecycleText(duplicate.device.lifecycle)}) : fusionnez plutôt que de créer un doublon.`,
        duplicate.device,
        duplicate.matchedOn,
      );
    }

    const device = createManualDevice(this.ids.next(), command, now);
    await this.devices.save(device);
    await this.decisions.insert(decisionFor(this.ids.next(), 'created', command.author, now, null, device));
    return { device, created: true };
  }

  private async merge(command: CreateDeviceCommand, known: Device[], now: Date): Promise<Device> {
    const target = known.find((device) => device.id === command.mergeInto);
    if (!target) throw new NotFoundError(`Équipement ${command.mergeInto} introuvable`);

    const duplicate = findDuplicate(command, [target]);
    if (!duplicate) {
      throw new ValidationError(
        `« ${displayName(target)} » n’a ni l’IP ni la MAC saisies : la fusion ne concerne que le même équipement.`,
      );
    }

    // La fiche saisie l'emporte ; ce que le collecteur a observé (MAC, nom réseau, mesures) est conservé.
    const merged: Device = {
      ...classifyDevice(target, {
        kind: command.kind,
        label: command.label,
        critical: command.critical,
        lifecycle: 'active',
      }),
      mac: target.mac ?? command.mac,
    };
    await this.devices.save(merged);
    await this.decisions.insert(decisionFor(this.ids.next(), 'merged', command.author, now, target.lifecycle, merged));

    const open = await this.events.findOpen();
    const discovery = open.find((e) => e.deviceId === target.id && e.dedupeKey === DISCOVERY_KEY);
    if (discovery) await this.events.save(resolveEvent(discovery, now));

    return merged;
  }
}

function findDuplicate(
  input: Pick<ManualDeviceInput, 'ip' | 'mac'>,
  devices: Device[],
): { device: Device; matchedOn: Array<'ip' | 'mac'> } | null {
  const mac = input.mac ? normalizeMac(input.mac) : null;
  const matchesOf = (device: Device): Array<'ip' | 'mac'> => [
    ...(device.ip === input.ip ? (['ip'] as const) : []),
    ...(mac && device.mac && normalizeMac(device.mac) === mac ? (['mac'] as const) : []),
  ];

  // La MAC identifie la carte réseau mieux que l'IP, qui peut changer : elle l'emporte.
  const byMac = devices.find((device) => matchesOf(device).includes('mac'));
  const found = byMac ?? devices.find((device) => matchesOf(device).length > 0);
  return found ? { device: found, matchedOn: matchesOf(found) } : null;
}

function describeMatch(matchedOn: Array<'ip' | 'mac'>): string {
  if (matchedOn.length === 2) return 'Même IP et même MAC';
  return matchedOn[0] === 'mac' ? 'Même MAC' : 'Même IP';
}

function displayName(device: Device): string {
  return device.label ?? device.hostname ?? device.ip;
}

function lifecycleText(lifecycle: DeviceLifecycle): string {
  switch (lifecycle) {
    case 'pending_classification':
      return 'détecté par le collecteur, à valider';
    case 'active':
      return 'déjà dans le référentiel';
    case 'ignored':
      return 'ignoré';
    case 'excluded':
      return 'exclu';
  }
}
