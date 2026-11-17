import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import { keysWithPrefix, type DetectionIntent, type OpenEventKeys } from './intents.js';

export const TLS_INVALID_PREFIX = 'tls_invalid';

/**
 * Signalement : le scanner a refusé un certificat (auto-signé, nom d'hôte différent,
 * chaîne de confiance incomplète, révoqué, pas encore valide…).
 *
 * Un certificat simplement expiré n'est pas signalé ici : la règle d'expiration
 * (tls-expiry) le suit déjà, avec le nombre de jours de retard.
 */
export function detectTlsValidity(
  device: Device,
  openKeys: OpenEventKeys,
  now: Date,
): DetectionIntent[] {
  if (!isMonitored(device)) return [];

  const name = deviceDisplayName(device);
  const intents: DetectionIntent[] = [];
  const expectedKeys = new Set<string>();

  for (const certificate of device.certificates) {
    if (certificate.valid !== false) continue;
    if (certificate.expiresAt.getTime() <= now.getTime()) continue;

    const key = `${TLS_INVALID_PREFIX}:${certificate.port}`;
    expectedKeys.add(key);

    const reason = certificate.validationError ?? 'raison non précisée par le scanner';
    const summary = `Le certificat de sécurité de ${name} (port ${certificate.port}) n'est pas valide : ${reason}`;
    const details = {
      ip: device.ip,
      port: certificate.port,
      subject: certificate.subject,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom?.toISOString() ?? null,
      expiresAt: certificate.expiresAt.toISOString(),
      validationError: certificate.validationError,
    };

    if (openKeys.has(key)) {
      intents.push({ action: 'update', deviceId: device.id, dedupeKey: key, severity: 'warning', summary, details });
    } else {
      intents.push({
        action: 'open',
        event: {
          deviceId: device.id,
          type: 'tls_invalid',
          severity: 'warning',
          summary,
          details,
          dedupeKey: key,
          startedAt: now,
        },
      });
    }
  }

  for (const key of keysWithPrefix(openKeys, TLS_INVALID_PREFIX)) {
    if (!expectedKeys.has(key)) {
      intents.push({ action: 'resolve', deviceId: device.id, dedupeKey: key, at: now });
    }
  }

  return intents;
}
