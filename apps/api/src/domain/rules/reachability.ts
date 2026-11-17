import { deviceDisplayName, isMonitored, isOffline, type Device } from '../entities/device.js';
import type { EventDetails, EventSeverity } from '../entities/monitoring-event.js';
import type { DetectionIntent, OpenEventKeys } from './intents.js';
import type { Topology } from './topology.js';

export const UNREACHABLE_KEY = 'device_unreachable';
export const DOWNSTREAM_KEY = 'downstream_outage';

/** Au-delà de cette liste, les noms sont résumés (« … et 4 autres »). */
const MAX_NAMES = 6;

function names(devices: Device[]): string {
  const shown = devices.slice(0, MAX_NAMES).map(deviceDisplayName);
  const rest = devices.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} et ${rest} autre(s)` : shown.join(', ');
}

/**
 * « la passerelle gw-atelier », ou le nom métier tel quel s'il dit déjà ce qu'est l'équipement
 * (« Passerelle atelier ») : évite « la passerelle Passerelle atelier ».
 */
function gatewayPhrase(gateway: Device, article: 'sa' | 'la'): string {
  const name = deviceDisplayName(gateway);
  return /^passerelle\b/i.test(name) ? name : `${article} passerelle ${name}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Diagnosis {
  severity: EventSeverity;
  summary: string;
  details: EventDetails;
  peerDeviceId: string | null;
}

/**
 * Trois situations bien différentes pour le technicien :
 * - la passerelle elle-même est en panne → c'est elle qu'il faut aller voir ;
 * - la machine est coupée par sa passerelle → rien à faire sur la machine ;
 * - la machine ne répond plus alors que sa passerelle répond → panne locale.
 */
function diagnose(device: Device, topology: Topology): Diagnosis {
  const name = deviceDisplayName(device);
  const gateway = topology.gatewayOf(device);
  const base: EventDetails = {
    ip: device.ip,
    hostname: device.hostname,
    lastSeenAt: device.lastSeenAt.toISOString(),
    missedScans: device.missedScans,
    gatewayIp: device.gatewayIp,
  };

  if (device.reachability === 'unreachable' && gateway) {
    return {
      severity: 'info',
      summary: `${name} injoignable : ${gatewayPhrase(gateway, 'sa')} est en panne`,
      details: { ...base, cause: 'gateway', gateway: deviceDisplayName(gateway) },
      peerDeviceId: gateway.id,
    };
  }

  const dependents = topology.dependentsOf(device);
  if (dependents.length > 0) {
    const cut = dependents.filter((dependent) => isOffline(dependent.reachability));
    return {
      severity: 'critical',
      summary:
        `${capitalize(gatewayPhrase(device, 'la'))} en panne : ${cut.length} machine(s) sur ${dependents.length} ` +
        `derrière elle sont injoignables`,
      details: {
        ...base,
        cause: 'device',
        role: 'gateway',
        dependents: dependents.length,
        dependentsCut: cut.length,
        dependentNames: names(cut),
      },
      peerDeviceId: null,
    };
  }

  const gatewayAnswers = gateway !== null && gateway.reachability === 'up';
  return {
    severity: device.critical ? 'critical' : 'warning',
    summary: gatewayAnswers
      ? `${name} ne répond plus (${gatewayPhrase(gateway, 'sa')} répond)`
      : `${name} ne répond plus`,
    details: { ...base, cause: 'device', gateway: gateway ? deviceDisplayName(gateway) : null },
    peerDeviceId: null,
  };
}

/**
 * Incident : un équipement surveillé cesse de répondre, puis revient.
 * La description suit l'évolution de la cause (passerelle tombée puis revenue alors que
 * la machine reste muette, par exemple) sans rouvrir un second incident.
 */
export function detectReachabilityChange(
  after: Device,
  openKeys: OpenEventKeys,
  at: Date,
  topology: Topology,
): DetectionIntent[] {
  if (!isMonitored(after)) return [];

  if (isOffline(after.reachability)) {
    const { severity, summary, details, peerDeviceId } = diagnose(after, topology);

    if (openKeys.has(UNREACHABLE_KEY)) {
      return [{ action: 'update', deviceId: after.id, dedupeKey: UNREACHABLE_KEY, severity, summary, details, peerDeviceId }];
    }
    return [
      {
        action: 'open',
        event: {
          deviceId: after.id,
          peerDeviceId,
          type: 'device_unreachable',
          severity,
          summary,
          details,
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

/**
 * Incident : la passerelle répond, mais aucune des machines derrière elle ne répond plus.
 * La passerelle n'est pas en cause ; la panne est en aval (switch d'étage, câblage,
 * coupure électrique d'une zone). Au moins deux machines sont nécessaires pour conclure.
 */
export function detectDownstreamOutage(
  gateway: Device,
  openKeys: OpenEventKeys,
  at: Date,
  topology: Topology,
): DetectionIntent[] {
  if (!isMonitored(gateway)) return [];

  const dependents = topology.dependentsOf(gateway).filter(isMonitored);
  const allDown =
    gateway.reachability === 'up' &&
    dependents.length >= 2 &&
    dependents.every((dependent) => dependent.reachability === 'down');

  if (!allDown) {
    return openKeys.has(DOWNSTREAM_KEY)
      ? [{ action: 'resolve', deviceId: gateway.id, dedupeKey: DOWNSTREAM_KEY, at }]
      : [];
  }

  const name = deviceDisplayName(gateway);
  const summary =
    `Les ${dependents.length} machines derrière ${name} ne répondent plus alors que la passerelle répond : ` +
    `panne probable en aval (switch, câblage, alimentation de la zone)`;
  const details: EventDetails = {
    ip: gateway.ip,
    role: 'gateway',
    dependents: dependents.length,
    dependentNames: names(dependents),
  };

  if (openKeys.has(DOWNSTREAM_KEY)) {
    return [{ action: 'update', deviceId: gateway.id, dedupeKey: DOWNSTREAM_KEY, severity: 'critical', summary, details }];
  }
  return [
    {
      action: 'open',
      event: {
        deviceId: gateway.id,
        type: 'downstream_outage',
        severity: 'critical',
        summary,
        details,
        dedupeKey: DOWNSTREAM_KEY,
        startedAt: at,
      },
    },
  ];
}
