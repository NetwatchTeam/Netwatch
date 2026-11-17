import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import type { EventDetails, EventSeverity } from '../entities/monitoring-event.js';
import type { MonitoringPolicy } from '../policy.js';
import { keysWithPrefix, type DetectionIntent, type OpenEventKeys } from './intents.js';

export const RESOURCE_PREFIX = 'resource';

/** Au-delà, la ressource est pleine en pratique : blocage imminent. */
const CRITICAL_USAGE_PERCENT = 98;

interface Reading {
  key: string;
  /** Début de phrase accordé : « processeur chargé », « mémoire occupée », « disque C: rempli ». */
  label: string;
  usedPercent: number;
  thresholdPercent: number;
  details: EventDetails;
}

function format(percent: number): string {
  return `${Number(percent.toFixed(1))} %`.replace('.', ',');
}

/**
 * Lectures disponibles à ce scan. Une ressource non mesurée (`null`, disque absent)
 * n'apparaît pas : on ne peut ni confirmer ni lever une saturation sans mesure.
 */
function readingsOf(device: Device, policy: MonitoringPolicy): { readings: Reading[]; measured: Set<string> } {
  const readings: Reading[] = [];
  const measured = new Set<string>();

  if (device.cpuPercent !== null) {
    const key = `${RESOURCE_PREFIX}:cpu`;
    measured.add(key);
    readings.push({
      key,
      label: 'processeur chargé',
      usedPercent: device.cpuPercent,
      thresholdPercent: policy.cpuWarningPercent,
      details: { resource: 'cpu' },
    });
  }

  if (device.memory !== null) {
    const key = `${RESOURCE_PREFIX}:memory`;
    measured.add(key);
    readings.push({
      key,
      label: 'mémoire occupée',
      usedPercent: device.memory.usedPercent,
      thresholdPercent: policy.memoryWarningPercent,
      details: { resource: 'memory', totalMb: device.memory.totalMb },
    });
  }

  if (device.disks.length > 0) {
    // Les disques sont remontés en bloc : un disque absent de la liste a été retiré.
    measured.add(`${RESOURCE_PREFIX}:disk`);
    for (const disk of device.disks) {
      readings.push({
        key: `${RESOURCE_PREFIX}:disk:${disk.name}`,
        label: `disque ${disk.name} rempli`,
        usedPercent: disk.usedPercent,
        thresholdPercent: policy.diskWarningPercent,
        details: { resource: 'disk', disk: disk.name, totalGb: disk.totalGb },
      });
    }
  }

  return { readings, measured };
}

/** Une clé ouverte ne peut être refermée que si la ressource correspondante a été mesurée. */
function wasMeasured(key: string, measured: Set<string>): boolean {
  if (key.startsWith(`${RESOURCE_PREFIX}:disk:`)) return measured.has(`${RESOURCE_PREFIX}:disk`);
  return measured.has(key);
}

/**
 * Observation : processeur, mémoire ou disque au-dessus du seuil configuré.
 * Un événement par ressource ; il suit la valeur tant qu'elle reste haute
 * et se referme dès qu'elle repasse sous le seuil.
 */
export function detectResourceSaturation(
  device: Device,
  openKeys: OpenEventKeys,
  policy: MonitoringPolicy,
  at: Date,
): DetectionIntent[] {
  if (!isMonitored(device)) return [];

  const name = deviceDisplayName(device);
  const { readings, measured } = readingsOf(device, policy);
  const saturated = new Set<string>();
  const intents: DetectionIntent[] = [];

  for (const reading of readings) {
    if (reading.usedPercent < reading.thresholdPercent) continue;
    saturated.add(reading.key);

    const severity: EventSeverity = reading.usedPercent >= CRITICAL_USAGE_PERCENT ? 'critical' : 'warning';
    const summary = `${name} : ${reading.label} à ${format(reading.usedPercent)}`;
    const details: EventDetails = {
      ip: device.ip,
      ...reading.details,
      usedPercent: reading.usedPercent,
      thresholdPercent: reading.thresholdPercent,
    };

    if (openKeys.has(reading.key)) {
      intents.push({ action: 'update', deviceId: device.id, dedupeKey: reading.key, severity, summary, details });
    } else {
      intents.push({
        action: 'open',
        event: {
          deviceId: device.id,
          type: 'resource_saturation',
          severity,
          summary,
          details,
          dedupeKey: reading.key,
          startedAt: at,
        },
      });
    }
  }

  for (const key of keysWithPrefix(openKeys, RESOURCE_PREFIX)) {
    if (!saturated.has(key) && wasMeasured(key, measured)) {
      intents.push({ action: 'resolve', deviceId: device.id, dedupeKey: key, at });
    }
  }

  return intents;
}
