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

/** Dernier état de joignabilité observé. */
export const DEVICE_REACHABILITIES = ['up', 'down', 'unknown'] as const;
export type DeviceReachability = (typeof DEVICE_REACHABILITIES)[number];

export interface TlsCertificateDto {
  port: number;
  subject: string;
  issuer: string | null;
  expiresAt: string;
  daysBeforeExpiry: number;
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
  latencyMs: number | null;
  openPorts: number[];
  certificates: TlsCertificateDto[];
  firstSeenAt: string;
  lastSeenAt: string;
  /** Date du dernier changement de joignabilité (début de la panne en cours, le cas échéant). */
  lastChangeAt: string;
  openEvents: number;
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
