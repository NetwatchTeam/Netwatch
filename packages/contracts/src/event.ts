/**
 * Les quatre familles d'informations remontées par le scanner.
 * La catégorie pilote l'affichage : un gestionnaire ne lit que `incident`.
 */
export const EVENT_CATEGORIES = ['incident', 'observation', 'signalement', 'configuration'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_TYPES = [
  /** incident — l'équipement ne répond plus */
  'device_unreachable',
  /** observation — débit entre deux machines nettement inférieur à l'habitude */
  'throughput_degraded',
  /** signalement — port sensible ouvert */
  'exposed_port',
  /** signalement — certificat TLS proche de l'expiration */
  'tls_expiring',
  /** configuration — nouvel équipement à classer */
  'device_discovered',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_CATEGORY_BY_TYPE: Record<EventType, EventCategory> = {
  device_unreachable: 'incident',
  throughput_degraded: 'observation',
  exposed_port: 'signalement',
  tls_expiring: 'signalement',
  device_discovered: 'configuration',
};

export const EVENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

/** `open` tant que la cause persiste ; `resolved` dès que le scanner constate le retour à la normale. */
export const EVENT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventDto {
  id: string;
  deviceId: string;
  deviceName: string;
  peerDeviceId: string | null;
  peerDeviceName: string | null;
  type: EventType;
  category: EventCategory;
  severity: EventSeverity;
  status: EventStatus;
  /** Phrase lisible par un non-technicien. */
  summary: string;
  /** Détails chiffrés destinés au technicien (port, débit mesuré, date d'expiration…). */
  details: Record<string, string | number | boolean | null>;
  startedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  /** Durée écoulée (ou durée totale si résolu), en secondes. */
  durationSeconds: number;
}

export interface EventFilters {
  category?: EventCategory;
  status?: EventStatus;
  deviceId?: string;
  since?: string;
  limit?: number;
}
