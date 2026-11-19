import type {
  DependencyRepository,
  DeviceDecisionRepository,
  DeviceQuery,
  DeviceRepository,
  EventQuery,
  EventRepository,
  PolicyRepository,
  ScanRunRepository,
  ThroughputRepository,
} from '../../../application/ports/repositories.js';
import type { IdGenerator } from '../../../application/ports/system.js';
import type { Repositories } from '../../../container.js';
import type { Dependency } from '../../../domain/entities/dependency.js';
import type { DeviceDecision } from '../../../domain/entities/device-decision.js';
import { deviceDisplayName, type Device } from '../../../domain/entities/device.js';
import type { ScanRun, ThroughputSample } from '../../../domain/entities/measurement.js';
import type { EventType, MonitoringEvent } from '../../../domain/entities/monitoring-event.js';
import { DEFAULT_POLICY, type MonitoringPolicy } from '../../../domain/policy.js';

/**
 * Stockage en mémoire, au comportement aligné sur les dépôts PostgreSQL (filtres, tri, limites).
 * Sert aux tests, à la génération des exemples du contrat, et à `STORAGE=memory` :
 * faire tourner l'API et le tableau de bord sans base de données (données perdues à l'arrêt).
 */

export class InMemoryDeviceRepository implements DeviceRepository {
  readonly items = new Map<string, Device>();

  async findAll(query: DeviceQuery = {}): Promise<Device[]> {
    const q = query.q?.toLowerCase();
    return [...this.items.values()]
      .filter(
        (device) =>
          (!query.kind || device.kind === query.kind) &&
          (!query.lifecycle || device.lifecycle === query.lifecycle) &&
          (!query.reachability || device.reachability === query.reachability) &&
          (!q ||
            [device.ip, device.hostname, device.label, device.vendor, device.mac].some((field) =>
              field?.toLowerCase().includes(q),
            )),
      )
      .sort(
        (a, b) =>
          Number(b.critical) - Number(a.critical) || deviceDisplayName(a).localeCompare(deviceDisplayName(b)),
      );
  }

  async findById(id: string): Promise<Device | null> {
    return this.items.get(id) ?? null;
  }

  async save(device: Device): Promise<void> {
    this.items.set(device.id, device);
  }

  async saveMany(devices: Device[]): Promise<void> {
    for (const device of devices) this.items.set(device.id, device);
  }
}

export class InMemoryDeviceDecisionRepository implements DeviceDecisionRepository {
  readonly items: DeviceDecision[] = [];

  async insert(decision: DeviceDecision): Promise<void> {
    this.items.push(decision);
  }

  async listByDevice(deviceId: string, limit = 50): Promise<DeviceDecision[]> {
    // Ordre d'insertion inversé à date égale, comme `order by decided_at desc` le serait en pratique.
    return this.items
      .map((decision, index) => ({ decision, index }))
      .filter(({ decision }) => decision.deviceId === deviceId)
      .sort((a, b) => b.decision.decidedAt.getTime() - a.decision.decidedAt.getTime() || b.index - a.index)
      .slice(0, Math.min(limit, 500))
      .map(({ decision }) => decision);
  }
}

const byStartDesc = (a: MonitoringEvent, b: MonitoringEvent) => b.startedAt.getTime() - a.startedAt.getTime();
const byStartAsc = (a: MonitoringEvent, b: MonitoringEvent) => a.startedAt.getTime() - b.startedAt.getTime();

export class InMemoryEventRepository implements EventRepository {
  readonly items = new Map<string, MonitoringEvent>();

  async list(query: EventQuery = {}): Promise<MonitoringEvent[]> {
    return [...this.items.values()]
      .filter(
        (event) =>
          (!query.category || event.category === query.category) &&
          (!query.status || event.status === query.status) &&
          (!query.deviceId || event.deviceId === query.deviceId || event.peerDeviceId === query.deviceId) &&
          (!query.since || event.startedAt >= query.since),
      )
      .sort(byStartDesc)
      .slice(0, Math.min(query.limit ?? 200, 500));
  }

  async findById(id: string): Promise<MonitoringEvent | null> {
    return this.items.get(id) ?? null;
  }

  async findOpen(): Promise<MonitoringEvent[]> {
    return [...this.items.values()].filter((event) => event.status !== 'resolved').sort(byStartDesc);
  }

  async findOverlapping(type: EventType, from: Date, to: Date): Promise<MonitoringEvent[]> {
    return [...this.items.values()]
      .filter(
        (event) =>
          event.type === type && event.startedAt < to && (event.resolvedAt === null || event.resolvedAt > from),
      )
      .sort(byStartAsc);
  }

  async findStartedBetween(from: Date, to: Date): Promise<MonitoringEvent[]> {
    return [...this.items.values()].filter((event) => event.startedAt >= from && event.startedAt < to).sort(byStartAsc);
  }

  async insertMany(events: MonitoringEvent[]): Promise<void> {
    for (const event of events) this.items.set(event.id, event);
  }

  async save(event: MonitoringEvent): Promise<void> {
    this.items.set(event.id, event);
  }

  async deleteResolvedBefore(date: Date): Promise<number> {
    let removed = 0;
    for (const [id, event] of this.items) {
      if (event.status === 'resolved' && event.resolvedAt && event.resolvedAt < date) {
        this.items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)]! + sorted[Math.ceil(middle)]!) / 2;
}

export class InMemoryThroughputRepository implements ThroughputRepository {
  readonly items: ThroughputSample[] = [];
  /** Référence imposée (tests) ; `null` : médiane réelle du trajet, comme en PostgreSQL. */
  baselineValue: number | null = null;

  async insertMany(samples: ThroughputSample[]): Promise<void> {
    this.items.push(...samples);
  }

  async listBetween(from: Date, to: Date, deviceId?: string): Promise<ThroughputSample[]> {
    return this.items
      .filter(
        (s) =>
          s.measuredAt >= from &&
          s.measuredAt <= to &&
          (!deviceId || s.sourceDeviceId === deviceId || s.targetDeviceId === deviceId),
      )
      .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  }

  async averageBetween(from: Date, to: Date): Promise<number | null> {
    const samples = this.items.filter((s) => s.measuredAt >= from && s.measuredAt <= to);
    if (samples.length === 0) return null;
    return samples.reduce((sum, sample) => sum + sample.mbps, 0) / samples.length;
  }

  async baseline(sourceDeviceId: string, targetDeviceId: string | null, since: Date): Promise<number | null> {
    if (this.baselineValue !== null) return this.baselineValue;
    return median(
      this.items
        .filter(
          (s) => s.sourceDeviceId === sourceDeviceId && s.targetDeviceId === targetDeviceId && s.measuredAt >= since,
        )
        .map((s) => s.mbps),
    );
  }

  async deleteBefore(date: Date): Promise<number> {
    const before = this.items.length;
    const kept = this.items.filter((sample) => sample.measuredAt >= date);
    this.items.length = 0;
    this.items.push(...kept);
    return before - this.items.length;
  }
}

export class InMemoryPolicyRepository implements PolicyRepository {
  constructor(private policy: MonitoringPolicy = { ...DEFAULT_POLICY }) {}

  async get(): Promise<MonitoringPolicy> {
    return this.policy;
  }

  async update(patch: Partial<MonitoringPolicy>): Promise<MonitoringPolicy> {
    this.policy = { ...this.policy, ...patch };
    return this.policy;
  }
}

export class InMemoryScanRunRepository implements ScanRunRepository {
  readonly runs: ScanRun[] = [];

  async start(run: ScanRun): Promise<void> {
    this.runs.push(run);
  }

  async finish(run: ScanRun): Promise<void> {
    const index = this.runs.findIndex((item) => item.id === run.id);
    if (index >= 0) this.runs[index] = run;
  }

  async last(): Promise<ScanRun | null> {
    return this.runs.at(-1) ?? null;
  }

  async list(limit: number): Promise<ScanRun[]> {
    return [...this.runs].reverse().slice(0, Math.min(limit, 200));
  }
}

export class InMemoryDependencyRepository implements DependencyRepository {
  readonly items = new Map<string, Dependency>();

  async list(): Promise<Dependency[]> {
    return [...this.items.values()];
  }

  async findById(id: string): Promise<Dependency | null> {
    return this.items.get(id) ?? null;
  }

  async insertMany(dependencies: Dependency[]): Promise<void> {
    for (const dependency of dependencies) this.items.set(dependency.id, dependency);
  }

  async saveMany(dependencies: Dependency[]): Promise<void> {
    for (const dependency of dependencies) this.items.set(dependency.id, dependency);
  }

  async deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) this.items.delete(id);
  }
}

/** Tous les dépôts, en mémoire, prêts pour `buildUseCases`. */
export function inMemoryRepositories() {
  return {
    devices: new InMemoryDeviceRepository(),
    decisions: new InMemoryDeviceDecisionRepository(),
    events: new InMemoryEventRepository(),
    throughput: new InMemoryThroughputRepository(),
    scanRuns: new InMemoryScanRunRepository(),
    policies: new InMemoryPolicyRepository(),
    dependencies: new InMemoryDependencyRepository(),
  } satisfies Repositories;
}

/** Identifiants au format UUID mais prévisibles : exemples reproductibles d'une génération à l'autre. */
export function sequentialUuids(): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
    },
  };
}
