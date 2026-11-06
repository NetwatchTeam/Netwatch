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

/**
 * `down` : la machine ne répond plus alors que le chemin pour l'atteindre fonctionne.
 * `unreachable` : la machine ne répond plus, mais sa passerelle est elle-même hors service :
 * on ne peut pas savoir si la machine est en panne, seulement qu'elle est coupée du réseau.
 */
export type DeviceReachability = 'up' | 'down' | 'unreachable' | 'unknown';

export function isOffline(reachability: DeviceReachability): boolean {
  return reachability === 'down' || reachability === 'unreachable';
}

export type PortProtocol = 'tcp' | 'udp';

/** Service identifié par le scanner derrière un port (ex. `https` servi par IIS 10.0). */
export interface PortService {
  name: string;
  product: string | null;
  version: string | null;
}

export interface OpenPort {
  port: number;
  protocol: PortProtocol;
  /** Un même port peut porter plusieurs services (ex. HTTP + WebSocket) ; vide si non identifié. */
  services: PortService[];
}

export interface MemoryUsage {
  usedPercent: number;
  totalMb: number | null;
}

export interface DiskUsage {
  /** Lecteur ou point de montage (`C:`, `/`, `/var`…). */
  name: string;
  usedPercent: number;
  totalGb: number | null;
}

export interface TlsCertificate {
  port: number;
  subject: string;
  issuer: string | null;
  /** Début de validité (notBefore). */
  validFrom: Date | null;
  /** Fin de validité (notAfter). */
  expiresAt: Date;
  /**
   * Résultat de la vérification faite par le scanner (chaîne de confiance, nom d'hôte, révocation…).
   * `null` si le scanner n'a pas pu vérifier.
   */
  valid: boolean | null;
  /** Raison de l'invalidité, lisible (« certificat auto-signé », « nom d'hôte différent »…). */
  validationError: string | null;
}

/** Mesures instantanées : remises à zéro quand la machine ne répond plus. */
export interface DeviceMetrics {
  latencyMs: number | null;
  /** Perte de paquets lors du test de joignabilité, en pourcentage (0 à 100). */
  packetLossPercent: number | null;
  /** Charge processeur, en pourcentage (0 à 100). */
  cpuPercent: number | null;
  memory: MemoryUsage | null;
}

export interface Device extends DeviceMetrics {
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
  /**
   * IP de l'équipement par lequel la machine est jointe (sa passerelle), telle que vue par le scanner.
   * Conservée quand la machine ne répond plus : c'est elle qui permet de distinguer une machine
   * en panne d'une machine coupée par la panne de sa passerelle.
   */
  gatewayIp: string | null;
  /** Conservés quand la machine ne répond plus : c'est le dernier état connu. */
  disks: DiskUsage[];
  ports: OpenPort[];
  certificates: TlsCertificate[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Date du dernier changement de joignabilité : début de la panne en cours, le cas échéant. */
  lastChangeAt: Date;
  /** Scans consécutifs sans réponse ; remis à zéro dès que l'équipement répond. */
  missedScans: number;
}

/** Ce que le scanner observe d'un équipement lors d'un passage. */
export interface DeviceObservation extends DeviceMetrics {
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  gatewayIp: string | null;
  disks: DiskUsage[];
  ports: OpenPort[];
  certificates: TlsCertificate[];
}

/** Numéros des ports ouverts, sans doublon (un port peut être ouvert en TCP et en UDP). */
export function openPortNumbers(device: Pick<Device, 'ports'>): number[] {
  return [...new Set(device.ports.map((entry) => entry.port))].sort((a, b) => a - b);
}

/** Nom lisible du ou des services d'un port, tel que rapporté par le scanner. */
export function describeServices(entry: OpenPort): string | null {
  if (entry.services.length === 0) return null;
  return entry.services
    .map((service) => [service.name, service.product, service.version].filter(Boolean).join(' '))
    .join(', ');
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
    gatewayIp: observation.gatewayIp,
    latencyMs: observation.latencyMs,
    packetLossPercent: observation.packetLossPercent,
    cpuPercent: observation.cpuPercent,
    memory: observation.memory,
    disks: observation.disks,
    ports: observation.ports,
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
    // Non précisée à ce scan : la topologie connue reste valable.
    gatewayIp: observation.gatewayIp ?? device.gatewayIp,
    latencyMs: observation.latencyMs,
    packetLossPercent: observation.packetLossPercent,
    cpuPercent: observation.cpuPercent,
    memory: observation.memory,
    // Une machine qui ne remonte pas ses disques à ce scan garde le dernier état connu.
    disks: observation.disks.length > 0 ? observation.disks : device.disks,
    ports: observation.ports,
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
  // Injoignable puis en panne, c'est la même interruption : sa date de début ne bouge pas.
  const justWentDown = isDown && !isOffline(device.reachability);

  return {
    ...device,
    reachability: isDown ? 'down' : device.reachability,
    // Plus de réponse : les mesures instantanées n'ont plus de sens.
    latencyMs: null,
    packetLossPercent: null,
    cpuPercent: null,
    memory: null,
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
