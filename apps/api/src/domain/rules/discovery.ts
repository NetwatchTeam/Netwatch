import { deviceDisplayName, isPendingClassification, openPortNumbers, type Device } from '../entities/device.js';
import type { DetectionIntent, OpenEventKeys } from './intents.js';

export const DISCOVERY_KEY = 'device_discovered';

/**
 * Ajout / configuration : une machine inconnue est apparue.
 * L'événement reste ouvert tant qu'un utilisateur n'a pas déclaré ce qu'elle est.
 */
export function detectDiscovery(
  device: Device,
  openKeys: OpenEventKeys,
  at: Date,
): DetectionIntent[] {
  const pending = isPendingClassification(device);

  if (pending && !openKeys.has(DISCOVERY_KEY)) {
    return [
      {
        action: 'open',
        event: {
          deviceId: device.id,
          type: 'device_discovered',
          severity: 'info',
          summary: `Nouvel équipement détecté : ${deviceDisplayName(device)} — à identifier`,
          details: {
            ip: device.ip,
            mac: device.mac,
            hostname: device.hostname,
            vendor: device.vendor,
            openPorts: openPortNumbers(device).join(', '),
          },
          dedupeKey: DISCOVERY_KEY,
          startedAt: device.firstSeenAt,
        },
      },
    ];
  }

  if (!pending && openKeys.has(DISCOVERY_KEY)) {
    return [{ action: 'resolve', deviceId: device.id, dedupeKey: DISCOVERY_KEY, at }];
  }

  return [];
}
