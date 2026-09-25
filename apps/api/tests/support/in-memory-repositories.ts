import type {
  DeviceQuery,
  DeviceRepository,
  EventQuery,
  EventRepository,
  PolicyRepository,
  ThroughputRepository,
} from '../../src/application/ports/repositories.js';
import type { IdGenerator } from '../../src/application/ports/system.js';
import type { Device } from '../../src/domain/entities/device.js';
import type { ThroughputSample } from '../../src/domain/entities/measurement.js';
import type { EventType, MonitoringEvent } from '../../src/domain/entities/monitoring-event.js';
import { DEFAULT_POLICY, type MonitoringPolicy } from '../../src/domain/policy.js';

/** Doublures en mémoire : les cas d'usage se testent sans PostgreSQL. */

export class InMemoryDeviceRepository implements DeviceRepository {
  readonly items = new Map<string, Device>();

  async findAll(query: DeviceQuery = {}): Promise<Device[]> {
    return [...this.items.values()].filter(
      (device) =>
        (!query.kind || device.kind === query.kind) &&
        (!query.lifecycle || device.lifecycle === query.lifecycle) &&
        (!query.reachability || device.reachability === query.reachability),
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

export class InMemoryEventRepository implements EventRepository {
  readonly items = new Map<string, MonitoringEvent>();

  async list(query: EventQuery = {}): Promise<MonitoringEvent[]> {
    return [...this.items.values()].filter(
      (event) =>
        (!query.category || event.category === query.category) &&
        (!query.status || event.status === query.status) &&
        (!query.deviceId || event.deviceId === query.deviceId) &&
        (!query.since || event.startedAt >= query.since),
    );
  }

  async findById(id: string): Promise<MonitoringEvent | null> {
    return this.items.get(id) ?? null;
  }

  async findOpen(): Promise<MonitoringEvent[]> {
    return [...this.items.values()].filter((event) => event.status !== 'resolved');
  }

  async findOverlapping(type: EventType, from: Date, to: Date): Promise<MonitoringEvent[]> {
    return [...this.items.values()].filter(
      (event) =>
        event.type === type &&
        event.startedAt < to &&
        (event.resolvedAt === null || event.resolvedAt > from),
    );
  }

  async findStartedBetween(from: Date, to: Date): Promise<MonitoringEvent[]> {
    return [...this.items.values()].filter(
      (event) => event.startedAt >= from && event.startedAt < to,
    );
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

export class InMemoryThroughputRepository implements ThroughputRepository {
  readonly items: ThroughputSample[] = [];
  baselineValue: number | null = null;

  async insertMany(samples: ThroughputSample[]): Promise<void> {
    this.items.push(...samples);
  }

  async listBetween(from: Date, to: Date): Promise<ThroughputSample[]> {
    return this.items.filter((sample) => sample.measuredAt >= from && sample.measuredAt <= to);
  }

  async averageBetween(): Promise<number | null> {
    if (this.items.length === 0) return null;
    return this.items.reduce((sum, sample) => sum + sample.mbps, 0) / this.items.length;
  }

  async baseline(): Promise<number | null> {
    return this.baselineValue;
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

export function sequentialIds(prefix = 'id'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}
