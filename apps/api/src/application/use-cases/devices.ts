import { classifyDevice, type ClassificationDecision, type Device } from '../../domain/entities/device.js';
import { resolveEvent } from '../../domain/entities/monitoring-event.js';
import { NotFoundError } from '../../domain/errors.js';
import { DISCOVERY_KEY } from '../../domain/rules/discovery.js';
import type { DeviceQuery, DeviceRepository, EventRepository } from '../ports/repositories.js';
import type { Clock } from '../ports/system.js';

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

/**
 * Un utilisateur déclare ce qu'est une machine détectée.
 * C'est la seule façon de sortir de l'état « en attente de classement »,
 * et cela referme l'événement d'ajout correspondant.
 */
export class ClassifyDevice {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: EventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, decision: ClassificationDecision): Promise<Device> {
    const device = await this.devices.findById(id);
    if (!device) throw new NotFoundError(`Équipement ${id} introuvable`);

    const classified = classifyDevice(device, decision);
    await this.devices.save(classified);

    const open = await this.events.findOpen();
    const discovery = open.find((e) => e.deviceId === id && e.dedupeKey === DISCOVERY_KEY);
    if (discovery) await this.events.save(resolveEvent(discovery, this.clock.now()));

    return classified;
  }
}
