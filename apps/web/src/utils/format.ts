import type {
  CertificateStatus,
  DependencySource,
  DependencyStatus,
  DeviceDecisionAction,
  DeviceKind,
  DeviceLifecycle,
  DeviceOrigin,
  DeviceReachability,
  EventCategory,
  EventSeverity,
  EventStatus,
  OpenPortDto,
} from '@netwatch/contracts';

export const REACHABILITY_LABELS: Record<DeviceReachability, string> = {
  up: 'En ligne',
  down: 'Hors ligne',
  unreachable: 'Injoignable (passerelle en panne)',
  unknown: 'Inconnu',
};

export const LIFECYCLE_LABELS: Record<DeviceLifecycle, string> = {
  pending_classification: 'À valider',
  active: 'Validé',
  ignored: 'Ignoré',
  excluded: 'Exclu',
};

export const ORIGIN_LABELS: Record<DeviceOrigin, string> = {
  discovered: 'Découvert par le collecteur',
  manual: 'Ajouté manuellement',
};

export const DECISION_LABELS: Record<DeviceDecisionAction, string> = {
  created: 'Ajouté manuellement',
  merged: 'Ajout manuel fusionné',
  validated: 'Validé',
  ignored: 'Ignoré',
  excluded: 'Exclu',
  updated: 'Fiche modifiée',
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

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Valeur déjà exprimée en pourcentage (0 à 100) : « 42,5 % ». */
export function formatPercentValue(value: number | null): string {
  return value === null ? '—' : `${decimal.format(value)} %`;
}

export function formatMegabytes(mb: number | null): string {
  if (mb === null) return '—';
  return mb >= 1024 ? `${decimal.format(mb / 1024)} Go` : `${decimal.format(mb)} Mo`;
}

export function formatGigabytes(gb: number | null): string {
  if (gb === null) return '—';
  return gb >= 1024 ? `${decimal.format(gb / 1024)} To` : `${decimal.format(gb)} Go`;
}

/**
 * Teinte d'affichage d'une charge (CPU, mémoire, disque). Repère visuel seulement :
 * les alertes, elles, suivent les seuils de la page « Réglages ».
 */
export type Tone = 'good' | 'warning' | 'critical' | 'neutral';

export function usageTone(percent: number | null): Tone {
  if (percent === null) return 'neutral';
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'warning';
  return 'good';
}

export function packetLossTone(percent: number | null): Tone {
  if (percent === null) return 'neutral';
  if (percent >= 5) return 'critical';
  if (percent > 0) return 'warning';
  return 'good';
}

export function certificateDaysTone(days: number): Tone {
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'good';
}

export const DEPENDENCY_STATUS_LABELS: Record<DependencyStatus, string> = {
  suggested: 'Suggérée',
  validated: 'Validée',
  rejected: 'Rejetée',
};

export const DEPENDENCY_SOURCE_LABELS: Record<DependencySource, string> = {
  discovered: 'Collecteur',
  manual: 'Manuelle',
};

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  valid: 'Valide',
  invalid: 'Invalide',
  expired: 'Expiré',
  unverified: 'Non vérifié',
};

/** « https (nginx 1.24) », plusieurs services séparés par des virgules. */
export function formatServices(port: OpenPortDto): string {
  if (port.services.length === 0) return 'Service non identifié';
  return port.services
    .map((service) => {
      const software = [service.product, service.version].filter(Boolean).join(' ');
      return software ? `${service.name} (${software})` : service.name;
    })
    .join(', ');
}
