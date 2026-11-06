import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import type { EventSeverity } from '../entities/monitoring-event.js';
import type { MonitoringPolicy } from '../policy.js';
import type { DetectionIntent, OpenEventKeys } from './intents.js';

export const PACKET_LOSS_KEY = 'packet_loss';

/** Au-delà, la machine est à peine joignable : la gêne est certaine pour les utilisateurs. */
const CRITICAL_LOSS_PERCENT = 50;

function format(percent: number): string {
  return `${Number(percent.toFixed(1))} %`.replace('.', ',');
}

/**
 * Observation : la machine répond, mais une partie des paquets se perd
 * (câble abîmé, Wi-Fi saturé, port de switch défaillant…).
 * Sans mesure à ce scan, l'événement en cours est laissé tel quel.
 */
export function detectPacketLoss(
  device: Device,
  openKeys: OpenEventKeys,
  policy: MonitoringPolicy,
  at: Date,
): DetectionIntent[] {
  if (!isMonitored(device)) return [];

  const loss = device.packetLossPercent;
  if (loss === null) return [];

  if (loss < policy.packetLossWarningPercent) {
    return openKeys.has(PACKET_LOSS_KEY)
      ? [{ action: 'resolve', deviceId: device.id, dedupeKey: PACKET_LOSS_KEY, at }]
      : [];
  }

  const severity: EventSeverity = loss >= CRITICAL_LOSS_PERCENT ? 'critical' : 'warning';
  const summary = `${deviceDisplayName(device)} perd ${format(loss)} des paquets`;
  const details = {
    ip: device.ip,
    packetLossPercent: loss,
    thresholdPercent: policy.packetLossWarningPercent,
    latencyMs: device.latencyMs,
  };

  if (openKeys.has(PACKET_LOSS_KEY)) {
    return [{ action: 'update', deviceId: device.id, dedupeKey: PACKET_LOSS_KEY, severity, summary, details }];
  }

  return [
    {
      action: 'open',
      event: {
        deviceId: device.id,
        type: 'packet_loss',
        severity,
        summary,
        details,
        dedupeKey: PACKET_LOSS_KEY,
        startedAt: at,
      },
    },
  ];
}
