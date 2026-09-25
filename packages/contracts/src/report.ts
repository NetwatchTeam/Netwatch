import type { EventCategory, EventSeverity } from './event.js';

export interface NetworkSummaryDto {
  /** Note de synthèse destinée au gestionnaire. */
  health: 'good' | 'attention' | 'critical';
  devices: {
    total: number;
    up: number;
    down: number;
    unknown: number;
    pendingClassification: number;
  };
  openEvents: Record<EventCategory, number>;
  /** Disponibilité du parc sur les 7 derniers jours, en pourcentage. */
  availability7d: number;
  /** Débit moyen mesuré sur les dernières 24 h, en Mbit/s. */
  averageThroughputMbps: number | null;
  lastScanAt: string | null;
  /** Vrai si le dernier scan a échoué ou n'a pas eu lieu à l'heure prévue. */
  scannerStale: boolean;
}

export interface ReportOutageDto {
  deviceId: string;
  deviceName: string;
  critical: boolean;
  outageCount: number;
  /** Indisponibilité cumulée sur la semaine, en minutes. */
  downtimeMinutes: number;
  longestOutageMinutes: number;
  availability: number;
}

export interface WeeklyReportDto {
  weekStart: string;
  weekEnd: string;
  /** Deux ou trois phrases résumant la semaine, lisibles sans connaissance réseau. */
  headline: string;
  devicesMonitored: number;
  devicesImpacted: number;
  totalDowntimeMinutes: number;
  availability: number;
  /** Pannes classées par indisponibilité cumulée décroissante. */
  topOutagesByDowntime: ReportOutageDto[];
  /** Pannes classées par nombre de machines touchées au même moment. */
  topOutagesByImpact: Array<{
    startedAt: string;
    endedAt: string | null;
    devicesImpacted: number;
    deviceNames: string[];
    durationMinutes: number;
  }>;
  eventsByCategory: Record<EventCategory, number>;
  newDevices: number;
  /** Signalements de sécurité encore ouverts à la fin de la semaine. */
  openSecurityFindings: Array<{ deviceName: string; summary: string; severity: EventSeverity }>;
  averageThroughputMbps: number | null;
  previousWeekAvailability: number | null;
}

export interface ThroughputPointDto {
  measuredAt: string;
  mbps: number;
  sourceDeviceId: string;
  targetDeviceId: string | null;
}

export interface ScanRunDto {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'succeeded' | 'failed';
  devicesSeen: number;
  eventsRaised: number;
  error: string | null;
}
