import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import type { MonitoringPolicy } from '../policy.js';
import type { DetectionIntent, OpenEventKeys } from './intents.js';

export const THROUGHPUT_PREFIX = 'throughput_degraded';

export interface ThroughputReading {
  source: Device;
  target: Device | null;
  mbps: number;
  /** Débit habituel sur ce trajet (moyenne récente), ou null si l'historique est insuffisant. */
  baselineMbps: number | null;
}

export function throughputKey(targetDeviceId: string | null): string {
  return `${THROUGHPUT_PREFIX}:${targetDeviceId ?? 'self'}`;
}

/**
 * Observation : le débit mesuré s'écarte nettement de l'habitude, ou passe
 * sous le plancher configuré. Ce n'est pas une panne, mais une dégradation à suivre.
 */
export function detectThroughputDegradation(
  reading: ThroughputReading,
  openKeys: OpenEventKeys,
  policy: MonitoringPolicy,
  at: Date,
): DetectionIntent[] {
  const { source, target, mbps, baselineMbps } = reading;
  if (!isMonitored(source)) return [];

  const key = throughputKey(target?.id ?? null);
  const threshold = baselineMbps === null ? null : baselineMbps * (1 - policy.throughputDropPercent / 100);
  const belowBaseline = threshold !== null && mbps < threshold;
  const belowFloor = mbps < policy.throughputFloorMbps;
  const degraded = belowBaseline || belowFloor;

  if (!degraded) {
    return openKeys.has(key) ? [{ action: 'resolve', deviceId: source.id, dedupeKey: key, at }] : [];
  }

  const path = target
    ? `entre ${deviceDisplayName(source)} et ${deviceDisplayName(target)}`
    : `pour ${deviceDisplayName(source)}`;
  const summary = belowBaseline
    ? `Débit ${path} en baisse : ${mbps.toFixed(1)} Mbit/s au lieu de ${baselineMbps?.toFixed(1)} Mbit/s habituellement`
    : `Débit ${path} faible : ${mbps.toFixed(1)} Mbit/s`;
  const details = {
    mbps: Number(mbps.toFixed(2)),
    baselineMbps: baselineMbps === null ? null : Number(baselineMbps.toFixed(2)),
    thresholdMbps: threshold === null ? null : Number(threshold.toFixed(2)),
    floorMbps: policy.throughputFloorMbps,
    sourceIp: source.ip,
    targetIp: target?.ip ?? null,
  };
  const severity = belowFloor ? 'warning' : 'info';

  if (openKeys.has(key)) {
    return [{ action: 'update', deviceId: source.id, dedupeKey: key, severity, summary, details }];
  }

  return [
    {
      action: 'open',
      event: {
        deviceId: source.id,
        peerDeviceId: target?.id ?? null,
        type: 'throughput_degraded',
        severity,
        summary,
        details,
        dedupeKey: key,
        startedAt: at,
      },
    },
  ];
}
