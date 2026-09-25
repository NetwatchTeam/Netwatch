import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import type { DetectionIntent, OpenEventKeys } from './intents.js';

export const UNREACHABLE_KEY = 'device_unreachable';

/**
 * Incident : un équipement surveillé cesse de répondre, puis revient.
 * La comparaison porte sur l'état avant et après le scan, pas sur le scan lui-même.
 */
export function detectReachabilityChange(
  before: Device,
  after: Device,
  openKeys: OpenEventKeys,
  at: Date,
): DetectionIntent[] {
  if (!isMonitored(after)) return [];

  const name = deviceDisplayName(after);

  if (after.reachability === 'down' && before.reachability !== 'down' && !openKeys.has(UNREACHABLE_KEY)) {
    return [
      {
        action: 'open',
        event: {
          deviceId: after.id,
          type: 'device_unreachable',
          severity: after.critical ? 'critical' : 'warning',
          summary: `${name} ne répond plus`,
          details: {
            ip: after.ip,
            hostname: after.hostname,
            lastSeenAt: after.lastSeenAt.toISOString(),
            missedScans: after.missedScans,
          },
          dedupeKey: UNREACHABLE_KEY,
          // La panne a commencé au moment du changement d'état, pas à la détection.
          startedAt: after.lastChangeAt,
        },
      },
    ];
  }

  if (after.reachability === 'up' && openKeys.has(UNREACHABLE_KEY)) {
    return [{ action: 'resolve', deviceId: after.id, dedupeKey: UNREACHABLE_KEY, at }];
  }

  return [];
}
