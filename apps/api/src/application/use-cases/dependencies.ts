import { deviceDisplayName, type Device } from '../../domain/entities/device.js';
import { validatedEdges, type Dependency, type DependencyStatus } from '../../domain/entities/dependency.js';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors.js';
import { cycleCreatedBy, dependencyIssues, type DependencyIssue } from '../../domain/rules/dependency-graph.js';
import { Topology } from '../../domain/rules/topology.js';
import type { DependencyRepository, DeviceRepository } from '../ports/repositories.js';
import type { Clock, IdGenerator } from '../ports/system.js';

export interface DependencyListing {
  dependencies: Dependency[];
  issues: DependencyIssue[];
  devices: Device[];
}

/** Le graphe, ses incohérences et les machines qu'il relie (pour afficher les noms). */
export class ListDependencies {
  constructor(
    private readonly dependencies: DependencyRepository,
    private readonly devices: DeviceRepository,
  ) {}

  async execute(): Promise<DependencyListing> {
    const [dependencies, devices] = await Promise.all([this.dependencies.list(), this.devices.findAll()]);
    return { dependencies, issues: dependencyIssues(dependencies, devices), devices };
  }
}

/** Topologie utilisée par la corrélation : le parc et ses seules dépendances validées. */
export class GetTopology {
  constructor(
    private readonly dependencies: DependencyRepository,
    private readonly devices: DeviceRepository,
  ) {}

  async execute(): Promise<Topology> {
    const [dependencies, devices] = await Promise.all([this.dependencies.list(), this.devices.findAll()]);
    return new Topology(devices, validatedEdges(dependencies));
  }
}

/** Règles communes aux modifications humaines du graphe. */
abstract class DependencyCommand {
  constructor(
    protected readonly dependencies: DependencyRepository,
    protected readonly devices: DeviceRepository,
    protected readonly clock: Clock,
  ) {}

  protected async requireDevice(id: string): Promise<Device> {
    const device = await this.devices.findById(id);
    if (!device) throw new NotFoundError(`Équipement ${id} introuvable`);
    return device;
  }

  /** Une dépendance validée ne doit jamais fermer une boucle : la corrélation n'aurait plus de cause. */
  protected async assertNoCycle(all: Dependency[], candidate: Dependency): Promise<void> {
    const others = validatedEdges(all.filter((d) => d.id !== candidate.id));
    const cycle = cycleCreatedBy(others, candidate);
    if (!cycle) return;

    const names = await Promise.all(
      cycle.map(async (id) => {
        const device = await this.devices.findById(id);
        return device ? deviceDisplayName(device) : id;
      }),
    );
    throw new ConflictError(`Cette dépendance créerait un cycle : ${names.join(' → ')}`);
  }
}

/**
 * Création manuelle : c'est une décision humaine, elle est donc validée d'emblée.
 * Si le lien existait déjà (suggéré ou rejeté), il est simplement validé.
 */
export class CreateDependency extends DependencyCommand {
  constructor(
    dependencies: DependencyRepository,
    devices: DeviceRepository,
    clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    super(dependencies, devices, clock);
  }

  async execute(input: { deviceId: string; dependsOnId: string }): Promise<Dependency> {
    if (input.deviceId === input.dependsOnId) {
      throw new ValidationError('Un équipement ne peut pas dépendre de lui-même');
    }
    await this.requireDevice(input.deviceId);
    await this.requireDevice(input.dependsOnId);

    const all = await this.dependencies.list();
    const now = this.clock.now();
    const existing = all.find((d) => d.deviceId === input.deviceId && d.dependsOnId === input.dependsOnId);
    const dependency: Dependency = existing
      ? { ...existing, status: 'validated', updatedAt: now }
      : {
          id: this.ids.next(),
          deviceId: input.deviceId,
          dependsOnId: input.dependsOnId,
          source: 'manual',
          status: 'validated',
          createdAt: now,
          updatedAt: now,
          observedAt: null,
        };

    await this.assertNoCycle(all, dependency);
    if (existing) await this.dependencies.saveMany([dependency]);
    else await this.dependencies.insertMany([dependency]);
    return dependency;
  }
}

export interface DependencyChange {
  status?: DependencyStatus;
  /** Corrige l'équipement dont la machine dépend. La dépendance devient manuelle et validée. */
  dependsOnId?: string;
}

/** Valider, rejeter, restaurer une suggestion, ou corriger la passerelle d'une machine. */
export class UpdateDependency extends DependencyCommand {
  async execute(id: string, change: DependencyChange): Promise<Dependency> {
    const all = await this.dependencies.list();
    const current = all.find((d) => d.id === id);
    if (!current) throw new NotFoundError(`Dépendance ${id} introuvable`);
    const now = this.clock.now();

    if (change.dependsOnId !== undefined && change.dependsOnId !== current.dependsOnId) {
      if (change.dependsOnId === current.deviceId) {
        throw new ValidationError('Un équipement ne peut pas dépendre de lui-même');
      }
      await this.requireDevice(change.dependsOnId);
      if (all.some((d) => d.deviceId === current.deviceId && d.dependsOnId === change.dependsOnId)) {
        throw new ConflictError('Cette dépendance existe déjà : validez-la plutôt que de modifier celle-ci');
      }
      const edited: Dependency = {
        ...current,
        dependsOnId: change.dependsOnId,
        source: 'manual',
        status: 'validated',
        updatedAt: now,
        observedAt: null,
      };
      await this.assertNoCycle(all, edited);
      await this.dependencies.saveMany([edited]);
      return edited;
    }

    if (change.status === undefined || change.status === current.status) return current;
    if (change.status === 'suggested' && current.source === 'manual') {
      throw new ValidationError('Une dépendance manuelle ne peut pas redevenir une suggestion');
    }

    const updated: Dependency = { ...current, status: change.status, updatedAt: now };
    if (updated.status === 'validated') await this.assertNoCycle(all, updated);
    await this.dependencies.saveMany([updated]);
    return updated;
  }
}

/**
 * Suppression. Une suggestion du collecteur est seulement rejetée : supprimée, elle
 * reviendrait au scan suivant. Une dépendance manuelle disparaît vraiment.
 */
export class DeleteDependency {
  constructor(
    private readonly dependencies: DependencyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<{ outcome: 'deleted' | 'rejected'; dependency: Dependency }> {
    const current = await this.dependencies.findById(id);
    if (!current) throw new NotFoundError(`Dépendance ${id} introuvable`);

    if (current.source === 'manual') {
      await this.dependencies.deleteMany([id]);
      return { outcome: 'deleted', dependency: current };
    }
    const rejected: Dependency = { ...current, status: 'rejected', updatedAt: this.clock.now() };
    await this.dependencies.saveMany([rejected]);
    return { outcome: 'rejected', dependency: rejected };
  }
}

/** Valide toutes les suggestions, sauf celles qui fermeraient un cycle (laissées à l'humain). */
export class ValidateAllSuggestions {
  constructor(
    private readonly dependencies: DependencyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ validated: number; skipped: number }> {
    const all = await this.dependencies.list();
    const now = this.clock.now();
    const accepted: Dependency[] = [];
    let skipped = 0;

    let graph = validatedEdges(all);
    for (const suggestion of all.filter((d) => d.status === 'suggested')) {
      // Une machine qui a déjà une dépendance validée : la suggestion contredit une décision humaine.
      const decided = all.some((d) => d.deviceId === suggestion.deviceId && d.status === 'validated');
      if (decided || cycleCreatedBy(graph, suggestion)) {
        skipped += 1;
        continue;
      }
      accepted.push({ ...suggestion, status: 'validated', updatedAt: now });
      graph = [...graph, suggestion];
    }

    if (accepted.length > 0) await this.dependencies.saveMany(accepted);
    return { validated: accepted.length, skipped };
  }
}
