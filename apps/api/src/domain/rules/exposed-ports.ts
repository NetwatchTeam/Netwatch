import { describeServices, deviceDisplayName, isMonitored, openPortNumbers, type Device } from '../entities/device.js';
import type { MonitoringPolicy } from '../policy.js';
import { keysWithPrefix, type DetectionIntent, type OpenEventKeys } from './intents.js';

export const EXPOSED_PORT_PREFIX = 'exposed_port';

/** Ports dont l'ouverture mérite une explication, même sur un réseau interne. */
const PORT_LABELS: Record<number, string> = {
  21: 'transfert de fichiers non chiffré (FTP)',
  23: 'administration non chiffrée (Telnet)',
  25: 'messagerie (SMTP)',
  110: 'messagerie non chiffrée (POP3)',
  143: 'messagerie non chiffrée (IMAP)',
  445: 'partage de fichiers Windows (SMB)',
  1433: 'base de données SQL Server',
  3306: 'base de données MySQL',
  3389: 'bureau à distance (RDP)',
  5432: 'base de données PostgreSQL',
  5900: 'prise en main à distance (VNC)',
};

function portKey(port: number): string {
  return `${EXPOSED_PORT_PREFIX}:${port}`;
}

/** Signalement : un port sensible est ouvert ; il se referme quand le port disparaît. */
export function detectExposedPorts(
  device: Device,
  openKeys: OpenEventKeys,
  policy: MonitoringPolicy,
  at: Date,
): DetectionIntent[] {
  if (!isMonitored(device)) return [];

  const open = openPortNumbers(device);
  const watched = policy.watchedPorts.filter((port) => open.includes(port));
  const expectedKeys = new Set(watched.map(portKey));
  const name = deviceDisplayName(device);
  const intents: DetectionIntent[] = [];

  for (const port of watched) {
    if (openKeys.has(portKey(port))) continue;
    // Le libellé maison explique le risque ; à défaut, on reprend le service vu par le scanner.
    const detected = device.ports
      .filter((entry) => entry.port === port)
      .map(describeServices)
      .filter((service): service is string => service !== null)
      .join(', ');
    const label = PORT_LABELS[port] ?? (detected || undefined);
    intents.push({
      action: 'open',
      event: {
        deviceId: device.id,
        type: 'exposed_port',
        severity: 'warning',
        summary: label
          ? `${name} expose le port ${port} — ${label}`
          : `${name} expose le port ${port}`,
        details: { ip: device.ip, port, service: label ?? null, detectedService: detected || null },
        dedupeKey: portKey(port),
        startedAt: at,
      },
    });
  }

  for (const key of keysWithPrefix(openKeys, EXPOSED_PORT_PREFIX)) {
    if (!expectedKeys.has(key)) {
      intents.push({ action: 'resolve', deviceId: device.id, dedupeKey: key, at });
    }
  }

  return intents;
}
