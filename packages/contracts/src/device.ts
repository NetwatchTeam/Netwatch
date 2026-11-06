/** Nature d'un équipement, déterminée par un utilisateur (jamais devinée par le scanner). */
export const DEVICE_KINDS = [
  'server',
  'workstation',
  'printer',
  'switch',
  'router',
  'access_point',
  'firewall',
  'nas',
  'camera',
  'phone',
  'iot',
  'other',
  'unknown',
] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/**
 * Cycle de vie d'un équipement dans le parc.
 * `pending_classification` : détecté par le scanner, en attente d'une décision humaine.
 */
export const DEVICE_LIFECYCLES = ['pending_classification', 'active', 'ignored'] as const;
export type DeviceLifecycle = (typeof DEVICE_LIFECYCLES)[number];

/**
 * Dernier état de joignabilité observé.
 * `down` : la machine ne répond plus alors que sa passerelle répond (panne de la machine).
 * `unreachable` : la machine ne répond plus parce que sa passerelle est hors service.
 */
export const DEVICE_REACHABILITIES = ['up', 'down', 'unreachable', 'unknown'] as const;
export type DeviceReachability = (typeof DEVICE_REACHABILITIES)[number];

export type PortProtocol = 'tcp' | 'udp';

export interface PortServiceDto {
  /** Nom du service (`https`, `ssh`…). */
  name: string;
  /** Logiciel identifié (`nginx`, `OpenSSH`…). */
  product: string | null;
  version: string | null;
}

export interface OpenPortDto {
  port: number;
  protocol: PortProtocol;
  services: PortServiceDto[];
}

export interface MemoryUsageDto {
  usedPercent: number;
  totalMb: number | null;
}

export interface DiskUsageDto {
  name: string;
  usedPercent: number;
  totalGb: number | null;
}

/**
 * Synthèse de l'état d'un certificat :
 * `expired` (date dépassée), `invalid` (refusé par la vérification du scanner),
 * `valid` (vérifié et en cours de validité), `unverified` (le scanner n'a pas pu vérifier).
 */
export const CERTIFICATE_STATUSES = ['valid', 'invalid', 'expired', 'unverified'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export interface TlsCertificateDto {
  port: number;
  subject: string;
  issuer: string | null;
  validFrom: string | null;
  expiresAt: string;
  daysBeforeExpiry: number;
  valid: boolean | null;
  validationError: string | null;
  status: CertificateStatus;
}

export interface DeviceDto {
  id: string;
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  kind: DeviceKind;
  /** Nom métier donné par un utilisateur (« Serveur comptabilité »). */
  label: string | null;
  /** Un équipement critique remonte en tête des rapports. */
  critical: boolean;
  lifecycle: DeviceLifecycle;
  reachability: DeviceReachability;
  /** IP de la passerelle par laquelle la machine est jointe, telle que rapportée par le scanner. */
  gatewayIp: string | null;
  /** Passerelle, si elle fait partie du parc suivi. */
  gateway: DeviceLinkDto | null;
  latencyMs: number | null;
  /** Perte de paquets, en pourcentage. */
  packetLossPercent: number | null;
  /** Charge processeur, en pourcentage. */
  cpuPercent: number | null;
  memory: MemoryUsageDto | null;
  disks: DiskUsageDto[];
  ports: OpenPortDto[];
  certificates: TlsCertificateDto[];
  firstSeenAt: string;
  lastSeenAt: string;
  /** Date du dernier changement de joignabilité (début de la panne en cours, le cas échéant). */
  lastChangeAt: string;
  openEvents: number;
}

export interface DeviceLinkDto {
  id: string;
  name: string;
  reachability: DeviceReachability;
}

export interface DeviceFilters {
  q?: string;
  kind?: DeviceKind;
  lifecycle?: DeviceLifecycle;
  reachability?: DeviceReachability;
}

/** Corps de PATCH /devices/:id — classer un équipement détecté. */
export interface ClassifyDeviceInput {
  kind: DeviceKind;
  label?: string | null;
  critical?: boolean;
  lifecycle?: Extract<DeviceLifecycle, 'active' | 'ignored'>;
}
