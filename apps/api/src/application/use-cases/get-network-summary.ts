import { isMonitored, isPendingClassification } from '../../domain/entities/device.js';
import type { EventCategory } from '../../domain/entities/monitoring-event.js';
import type {
  DeviceRepository,
  EventRepository,
  PolicyRepository,
  ScanRunRepository,
  ThroughputRepository,
} from '../ports/repositories.js';
import type { Clock } from '../ports/system.js';

export interface NetworkSummary {
  health: 'good' | 'attention' | 'critical';
  devices: {
    total: number;
    up: number;
    down: number;
    unreachable: number;
    unknown: number;
    pendingClassification: number;
  };
  openEvents: Record<EventCategory, number>;
  availability7d: number;
  averageThroughputMbps: number | null;
  lastScanAt: Date | null;
  scannerStale: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Vue d'ensemble destinée à la page d'accueil du gestionnaire. */
export class GetNetworkSummary {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: EventRepository,
    private readonly throughput: ThroughputRepository,
    private readonly scanRuns: ScanRunRepository,
    private readonly policies: PolicyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<NetworkSummary> {
    const now = this.clock.now();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    const [allDevices, openEvents, incidents, averageThroughputMbps, lastRun, policy] = await Promise.all([
      this.devices.findAll(),
      this.events.findOpen(),
      this.events.findOverlapping('device_unreachable', weekAgo, now),
      this.throughput.averageBetween(dayAgo, now),
      this.scanRuns.last(),
      this.policies.get(),
    ]);

    const monitored = allDevices.filter(isMonitored);
    const openByCategory: Record<EventCategory, number> = {
      incident: 0,
      observation: 0,
      signalement: 0,
      configuration: 0,
    };
    for (const event of openEvents) openByCategory[event.category] += 1;

    const downtimeMs = incidents.reduce((sum, event) => {
      const start = Math.max(event.startedAt.getTime(), weekAgo.getTime());
      const end = Math.min((event.resolvedAt ?? now).getTime(), now.getTime());
      return sum + Math.max(0, end - start);
    }, 0);
    const observedMs = Math.max(1, monitored.length * (now.getTime() - weekAgo.getTime()));
    const availability7d = Math.max(0, Math.min(1, (observedMs - downtimeMs) / observedMs));

    // Le scanner interroge toutes les `scanIntervalMinutes` ; au-delà de deux intervalles
    // sans résultat, la page doit dire que les données ne sont plus fraîches.
    const lastScanAt = lastRun?.finishedAt ?? null;
    const staleAfterMs = 2 * policy.scanIntervalMinutes * 60_000;
    const scannerStale =
      lastRun === null ||
      lastRun.status === 'failed' ||
      lastScanAt === null ||
      now.getTime() - lastScanAt.getTime() > staleAfterMs;

    return {
      health: healthFrom(openByCategory, scannerStale),
      devices: {
        total: monitored.length,
        up: monitored.filter((d) => d.reachability === 'up').length,
        down: monitored.filter((d) => d.reachability === 'down').length,
        unreachable: monitored.filter((d) => d.reachability === 'unreachable').length,
        unknown: monitored.filter((d) => d.reachability === 'unknown').length,
        pendingClassification: allDevices.filter(isPendingClassification).length,
      },
      openEvents: openByCategory,
      availability7d,
      averageThroughputMbps,
      lastScanAt,
      scannerStale,
    };
  }
}

function healthFrom(open: Record<EventCategory, number>, scannerStale: boolean): NetworkSummary['health'] {
  if (scannerStale || open.incident > 0) return 'critical';
  if (open.signalement > 0 || open.observation > 0) return 'attention';
  return 'good';
}
