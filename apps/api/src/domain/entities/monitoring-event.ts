export type EventType =
  | 'device_unreachable'
  | 'throughput_degraded'
  | 'exposed_port'
  | 'tls_expiring'
  | 'device_discovered';

export type EventCategory = 'incident' | 'observation' | 'signalement' | 'configuration';

export type EventSeverity = 'info' | 'warning' | 'critical';

export type EventStatus = 'open' | 'acknowledged' | 'resolved';

export const CATEGORY_BY_TYPE: Record<EventType, EventCategory> = {
  device_unreachable: 'incident',
  throughput_degraded: 'observation',
  exposed_port: 'signalement',
  tls_expiring: 'signalement',
  device_discovered: 'configuration',
};

export type EventDetails = Record<string, string | number | boolean | null>;

export interface MonitoringEvent {
  id: string;
  deviceId: string;
  /** Deuxième équipement concerné, pour une mesure de débit entre deux machines. */
  peerDeviceId: string | null;
  type: EventType;
  category: EventCategory;
  severity: EventSeverity;
  status: EventStatus;
  /** Formulation destinée à un lecteur non technique. */
  summary: string;
  /** Valeurs mesurées destinées au technicien. */
  details: EventDetails;
  /**
   * Clé d'unicité d'un événement ouvert pour un équipement :
   * évite de rouvrir le même signalement à chaque scan (ex. `exposed_port:3389`).
   */
  dedupeKey: string;
  startedAt: Date;
  resolvedAt: Date | null;
  acknowledgedAt: Date | null;
}

export interface NewEvent {
  deviceId: string;
  peerDeviceId?: string | null;
  type: EventType;
  severity: EventSeverity;
  summary: string;
  details?: EventDetails;
  dedupeKey: string;
  startedAt: Date;
}

export function openEvent(id: string, draft: NewEvent): MonitoringEvent {
  return {
    id,
    deviceId: draft.deviceId,
    peerDeviceId: draft.peerDeviceId ?? null,
    type: draft.type,
    category: CATEGORY_BY_TYPE[draft.type],
    severity: draft.severity,
    status: 'open',
    summary: draft.summary,
    details: draft.details ?? {},
    dedupeKey: draft.dedupeKey,
    startedAt: draft.startedAt,
    resolvedAt: null,
    acknowledgedAt: null,
  };
}

export function resolveEvent(event: MonitoringEvent, resolvedAt: Date): MonitoringEvent {
  if (event.status === 'resolved') return event;
  return { ...event, status: 'resolved', resolvedAt };
}

export function acknowledgeEvent(event: MonitoringEvent, acknowledgedAt: Date): MonitoringEvent {
  if (event.status !== 'open') return event;
  return { ...event, status: 'acknowledged', acknowledgedAt };
}

/** Prise en charge annulée (erreur, changement de technicien) : l'événement redevient à traiter. */
export function releaseEvent(event: MonitoringEvent): MonitoringEvent {
  if (event.status !== 'acknowledged') return event;
  return { ...event, status: 'open', acknowledgedAt: null };
}

export function isOpen(event: MonitoringEvent): boolean {
  return event.status !== 'resolved';
}

export function eventDurationSeconds(event: MonitoringEvent, now: Date): number {
  const end = event.resolvedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - event.startedAt.getTime()) / 1000));
}
