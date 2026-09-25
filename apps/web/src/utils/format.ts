import type {
  DeviceKind,
  DeviceLifecycle,
  DeviceReachability,
  EventCategory,
  EventSeverity,
  EventStatus,
} from '@netwatch/contracts';

export const REACHABILITY_LABELS: Record<DeviceReachability, string> = {
  up: 'En ligne',
  down: 'Hors ligne',
  unknown: 'Inconnu',
};

export const LIFECYCLE_LABELS: Record<DeviceLifecycle, string> = {
  pending_classification: 'À identifier',
  active: 'Suivi',
  ignored: 'Ignoré',
};

export const KIND_LABELS: Record<DeviceKind, string> = {
  server: 'Serveur',
  workstation: 'Poste de travail',
  printer: 'Imprimante',
  switch: 'Switch',
  router: 'Routeur',
  access_point: 'Point d’accès Wi-Fi',
  firewall: 'Pare-feu',
  nas: 'NAS / sauvegarde',
  camera: 'Caméra',
  phone: 'Téléphone IP',
  iot: 'Objet connecté',
  other: 'Autre',
  unknown: 'Non identifié',
};

/** Vocabulaire métier des quatre familles d'événements. */
export const CATEGORY_LABELS: Record<EventCategory, string> = {
  incident: 'Panne',
  observation: 'Observation',
  signalement: 'Signalement',
  configuration: 'À configurer',
};

export const SEVERITY_LABELS: Record<EventSeverity, string> = {
  info: 'Information',
  warning: 'À surveiller',
  critical: 'Critique',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  open: 'Ouvert',
  acknowledged: 'Pris en charge',
  resolved: 'Résolu',
};

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function formatDate(iso: string | null): string {
  return iso ? dateOnly.format(new Date(iso)) : '—';
}

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, 'second');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}

/** Durée en français courant : « 2 h 15 », « 3 j 4 h ». */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

export function formatMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}

export function formatPercent(ratio: number, digits = 2): string {
  return `${(ratio * 100).toFixed(digits).replace('.', ',')} %`;
}

export function formatMbps(mbps: number | null): string {
  if (mbps === null) return '—';
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} Gbit/s` : `${mbps.toFixed(0)} Mbit/s`;
}

export function formatLatency(ms: number | null): string {
  return ms === null ? '—' : `${ms} ms`;
}
