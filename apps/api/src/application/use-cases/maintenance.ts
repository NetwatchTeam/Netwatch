import type { ScanRun, ThroughputSample } from '../../domain/entities/measurement.js';
import type { MonitoringPolicy } from '../../domain/policy.js';
import type {
  PolicyRepository,
  ScanRunRepository,
  ThroughputRepository,
} from '../ports/repositories.js';
import type { EventRepository } from '../ports/repositories.js';
import type { Clock, Logger } from '../ports/system.js';

export class GetSettings {
  constructor(private readonly policies: PolicyRepository) {}

  execute(): Promise<MonitoringPolicy> {
    return this.policies.get();
  }
}

export class UpdateSettings {
  constructor(private readonly policies: PolicyRepository) {}

  execute(patch: Partial<MonitoringPolicy>): Promise<MonitoringPolicy> {
    return this.policies.update(patch);
  }
}

export class ListScanRuns {
  constructor(private readonly scanRuns: ScanRunRepository) {}

  execute(limit = 20): Promise<ScanRun[]> {
    return this.scanRuns.list(limit);
  }
}

export class GetThroughputHistory {
  constructor(private readonly throughput: ThroughputRepository) {}

  execute(from: Date, to: Date, deviceId?: string): Promise<ThroughputSample[]> {
    return this.throughput.listBetween(from, to, deviceId);
  }
}

/** Purge planifiée : la base d'un client doit rester petite sans intervention. */
export class PurgeExpiredData {
  constructor(
    private readonly events: EventRepository,
    private readonly throughput: ThroughputRepository,
    private readonly policies: PolicyRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ events: number; samples: number }> {
    const { retentionDays } = await this.policies.get();
    const cutoff = new Date(this.clock.now().getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const events = await this.events.deleteResolvedBefore(cutoff);
    const samples = await this.throughput.deleteBefore(cutoff);
    this.logger.info('Purge effectuée', { cutoff: cutoff.toISOString(), events, samples });

    return { events, samples };
  }
}
