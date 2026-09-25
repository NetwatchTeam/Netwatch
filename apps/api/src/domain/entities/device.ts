export type DeviceKind =
  | 'server'
  | 'workstation'
  | 'printer'
  | 'switch'
  | 'router'
  | 'access_point'
  | 'firewall'
  | 'nas'
  | 'camera'
  | 'phone'
  | 'iot'
  | 'other'
  | 'unknown';

export type DeviceLifecycle = 'pending_classification' | 'active' | 'ignored';

export type DeviceReachability = 'up' | 'down' | 'unknown';

export interface TlsCertificate {
  port: number;
  subject: string;
  issuer: string | null;
  expiresAt: Date;
}

export interface Device {
  id: string;
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  kind: DeviceKind;
  label: string | null;
  critical: boolean;
  lifecycle: DeviceLifecycle;
  reachability: DeviceReachability;
  latencyMs: number | null;
  openPorts: number[];
  certificates: TlsCertificate[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Date du dernier changement de joignabilité : début de la panne en cours, le cas échéant. */
  lastChangeAt: Date;
  /** Scans consécutifs sans réponse ; remis à zéro dès que l'équipement répond. */
  missedScans: number;
}

/** Ce que le scanner observe d'un équipement lors d'un passage. */
export interface DeviceObservation {
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  latencyMs: number | null;
  openPorts: number[];
  certificates: TlsCertificate[];
}

/**
 * Un équipement inconnu entre dans le parc en attente de classement :
 * il y reste tant qu'un utilisateur n'a pas déclaré ce qu'il est.
 */
export function createDiscoveredDevice(
  id: string,
  observation: DeviceObservation,
  seenAt: Date,
): Device {
  return {
    id,
    ip: observation.ip,
    mac: observation.mac,
    hostname: observation.hostname,
    vendor: observation.vendor,
    kind: 'unknown',
    label: null,
    critical: false,
    lifecycle: 'pending_classification',
    reachability: 'up',
    latencyMs: observation.latencyMs,
    openPorts: observation.openPorts,
    certificates: observation.certificates,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    lastChangeAt: seenAt,
    missedScans: 0,
  };
}

/** L'équipement a répondu : on met à jour ce que le scanner a vu. */
export function applyObservation(
  device: Device,
  observation: DeviceObservation,
  seenAt: Date,
): Device {
  const cameBack = device.reachability !== 'up';
  return {
    ...device,
    ip: observation.ip,
    mac: observation.mac ?? device.mac,
    hostname: observation.hostname ?? device.hostname,
    vendor: observation.vendor ?? device.vendor,
    latencyMs: observation.latencyMs,
    openPorts: observation.openPorts,
    certificates: observation.certificates,
    reachability: 'up',
    missedScans: 0,
    lastSeenAt: seenAt,
    lastChangeAt: cameBack ? seenAt : device.lastChangeAt,
  };
}

/**
 * L'équipement n'a pas répondu. Il n'est déclaré en panne qu'après
 * `missedScansBeforeIncident` passages infructueux, pour absorber un scan raté isolé.
 */
export function applyMiss(device: Device, scannedAt: Date, missedScansBeforeIncident: number): Device {
  const missedScans = device.missedScans + 1;
  const isDown = missedScans >= Math.max(1, missedScansBeforeIncident);
  const justWentDown = isDown && device.reachability !== 'down';

  return {
    ...device,
    reachability: isDown ? 'down' : device.reachability,
    latencyMs: null,
    missedScans,
    lastChangeAt: justWentDown ? scannedAt : device.lastChangeAt,
  };
}

export interface ClassificationDecision {
  kind: DeviceKind;
  label?: string | null;
  critical?: boolean;
  lifecycle?: Extract<DeviceLifecycle, 'active' | 'ignored'>;
}

/** Décision humaine : l'équipement quitte la file d'attente de classement. */
export function classifyDevice(device: Device, decision: ClassificationDecision): Device {
  return {
    ...device,
    kind: decision.kind,
    label: decision.label ?? device.label,
    critical: decision.critical ?? device.critical,
    lifecycle: decision.lifecycle ?? 'active',
  };
}

export function isPendingClassification(device: Device): boolean {
  return device.lifecycle === 'pending_classification';
}

/** Surveillé = compté dans les rapports et générateur d'incidents. */
export function isMonitored(device: Device): boolean {
  return device.lifecycle !== 'ignored';
}

/** Nom à afficher : le nom métier prime sur le nom technique. */
export function deviceDisplayName(device: Device): string {
  return device.label ?? device.hostname ?? device.ip;
}
