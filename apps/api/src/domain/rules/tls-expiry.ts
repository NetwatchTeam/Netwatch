import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import type { EventSeverity } from '../entities/monitoring-event.js';
import type { MonitoringPolicy } from '../policy.js';
import { keysWithPrefix, type DetectionIntent, type OpenEventKeys } from './intents.js';

export const TLS_PREFIX = 'tls_expiring';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBeforeExpiry(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

function severityFor(days: number): EventSeverity {
  if (days <= 0) return 'critical';
  if (days <= 7) return 'critical';
  return 'warning';
}

function summaryFor(name: string, port: number, days: number): string {
  if (days < 0) return `Le certificat de sécurité de ${name} (port ${port}) a expiré il y a ${-days} jour(s)`;
  if (days === 0) return `Le certificat de sécurité de ${name} (port ${port}) expire aujourd'hui`;
  return `Le certificat de sécurité de ${name} (port ${port}) expire dans ${days} jour(s)`;
}

/**
 * Signalement : un certificat TLS approche de son expiration.
 * L'alerte est levée `tlsWarningDays` jours avant (30 par défaut) et suit l'échéance
 * jour après jour, jusqu'au renouvellement du certificat.
 */
export function detectTlsExpiry(
  device: Device,
  openKeys: OpenEventKeys,
  policy: MonitoringPolicy,
  now: Date,
): DetectionIntent[] {
  if (!isMonitored(device)) return [];

  const name = deviceDisplayName(device);
  const intents: DetectionIntent[] = [];
  const expectedKeys = new Set<string>();

  for (const certificate of device.certificates) {
    const days = daysBeforeExpiry(certificate.expiresAt, now);
    if (days > policy.tlsWarningDays) continue;

    const key = `${TLS_PREFIX}:${certificate.port}`;
    expectedKeys.add(key);

    const severity = severityFor(days);
    const summary = summaryFor(name, certificate.port, days);
    const details = {
      ip: device.ip,
      port: certificate.port,
      subject: certificate.subject,
      issuer: certificate.issuer,
      expiresAt: certificate.expiresAt.toISOString(),
      daysBeforeExpiry: days,
    };

    if (openKeys.has(key)) {
      // L'échéance se rapproche : on actualise l'événement existant plutôt que d'en ouvrir un nouveau.
      intents.push({ action: 'update', deviceId: device.id, dedupeKey: key, severity, summary, details });
    } else {
      intents.push({
        action: 'open',
        event: {
          deviceId: device.id,
          type: 'tls_expiring',
          severity,
          summary,
          details,
          dedupeKey: key,
          startedAt: now,
        },
      });
    }
  }

  for (const key of keysWithPrefix(openKeys, TLS_PREFIX)) {
    if (!expectedKeys.has(key)) {
      intents.push({ action: 'resolve', deviceId: device.id, dedupeKey: key, at: now });
    }
  }

  return intents;
}
