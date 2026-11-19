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
 * Cycle de vie d'un équipement. Le scan propose, l'humain décide :
 * - `pending_classification` : détecté par le collecteur, « à valider » ; ni supervisé ni compté ;
 * - `active` : validé, il fait partie du référentiel et il est supervisé ;
 * - `ignored` : connu mais non supervisé (pas d'alerte), il reste visible dans le parc ;
 * - `excluded` : ne fait pas partie du parc (appareil de passage, autre réseau) : masqué et non supervisé.
 * Un équipement ignoré ou exclu n'est jamais reproposé comme nouveau.
 */
export const DEVICE_LIFECYCLES = ['pending_classification', 'active', 'ignored', 'excluded'] as const;
export type DeviceLifecycle = (typeof DEVICE_LIFECYCLES)[number];

/** Décisions possibles sur un équipement : valider, ignorer ou exclure. */
export const DEVICE_DECISION_LIFECYCLES = ['active', 'ignored', 'excluded'] as const;
export type DeviceDecisionLifecycle = (typeof DEVICE_DECISION_LIFECYCLES)[number];

/** `discovered` : trouvé par le collecteur ; `manual` : ajouté à la main (équipement non détectable par scan). */
export const DEVICE_ORIGINS = ['discovered', 'manual'] as const;
export type DeviceOrigin = (typeof DEVICE_ORIGINS)[number];

/**
 * Action tracée dans l'historique d'un équipement :
 * `created` (ajout manuel), `merged` (ajout manuel fusionné avec un équipement découvert),
 * `validated`, `ignored`, `excluded` (décision sur son cycle de vie), `updated` (fiche modifiée sans changer d'état).
 */
export const DEVICE_DECISION_ACTIONS = ['created', 'merged', 'validated', 'ignored', 'excluded', 'updated'] as const;
export type DeviceDecisionAction = (typeof DEVICE_DECISION_ACTIONS)[number];

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
  origin: DeviceOrigin;
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
  /** Première détection par le collecteur, ou date de l'ajout manuel. */
  firstSeenAt: string;
  /** Dernière réponse au collecteur ; `null` pour un équipement ajouté à la main et encore jamais vu. */
  lastSeenAt: string | null;
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

/** Corps de PATCH /devices/:id — décider du sort d'un équipement (valider, ignorer, exclure) ou modifier sa fiche. */
export interface ClassifyDeviceInput {
  kind: DeviceKind;
  label?: string | null;
  critical?: boolean;
  /** Par défaut `active` (valider). */
  lifecycle?: DeviceDecisionLifecycle;
  /** Qui prend la décision : enregistré dans l'historique de l'équipement. */
  author: string;
}

/** Corps de POST /devices — ajouter à la main un équipement que le collecteur ne détecte pas. */
export interface CreateDeviceInput {
  ip: string;
  /** Nom métier, obligatoire pour un ajout manuel. */
  label: string;
  /** Rôle de l'équipement (`unknown` refusé). */
  kind: DeviceKind;
  critical: boolean;
  mac?: string | null;
  author: string;
  /**
   * Fusionner avec l'équipement déjà connu à cette IP ou cette MAC (identifiant renvoyé par l'erreur 409
   * `duplicate_device`) : il reçoit le nom, le rôle et la criticité saisis et devient validé.
   */
  mergeInto?: string;
}

/** Corps de POST /devices/validate-pending — valider d'un coup toutes les machines à valider. */
export interface ValidatePendingInput {
  author: string;
}

/** Réponse de POST /devices/validate-pending. */
export interface ValidatePendingResultDto {
  /** Nombre d'équipements validés (une décision tracée par équipement). */
  validated: number;
  devices: DeviceLinkDto[];
}

/** Une ligne de l'historique des décisions d'un équipement. */
export interface DeviceDecisionDto {
  id: string;
  deviceId: string;
  action: DeviceDecisionAction;
  author: string;
  decidedAt: string;
  /** État avant la décision (`null` pour une création). */
  previousLifecycle: DeviceLifecycle | null;
  lifecycle: DeviceLifecycle;
  kind: DeviceKind;
  label: string | null;
  critical: boolean;
}

/** Détails de l'erreur 409 `duplicate_device` : l'équipement déjà connu à cette IP ou cette MAC. */
export interface DuplicateDeviceDetails {
  existing: DeviceLinkDto & { ip: string; mac: string | null; lifecycle: DeviceLifecycle; origin: DeviceOrigin };
  /** Ce qui correspond : même IP, même MAC, ou les deux. */
  matchedOn: Array<'ip' | 'mac'>;
}
