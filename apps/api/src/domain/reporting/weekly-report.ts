import { deviceDisplayName, isMonitored, type Device } from '../entities/device.js';
import type { EventCategory, EventSeverity, MonitoringEvent } from '../entities/monitoring-event.js';

const MS_PER_MINUTE = 60_000;

export interface OutageSummary {
  deviceId: string;
  deviceName: string;
  critical: boolean;
  outageCount: number;
  downtimeMinutes: number;
  longestOutageMinutes: number;
  availability: number;
}

/** Période continue pendant laquelle au moins une machine était en panne. */
export interface OutageEpisode {
  startedAt: Date;
  endedAt: Date | null;
  devicesImpacted: number;
  deviceNames: string[];
  durationMinutes: number;
}

export interface WeeklyReport {
  weekStart: Date;
  weekEnd: Date;
  headline: string;
  devicesMonitored: number;
  devicesImpacted: number;
  totalDowntimeMinutes: number;
  availability: number;
  topOutagesByDowntime: OutageSummary[];
  topOutagesByImpact: OutageEpisode[];
  eventsByCategory: Record<EventCategory, number>;
  newDevices: number;
  openSecurityFindings: Array<{ deviceName: string; summary: string; severity: EventSeverity }>;
  averageThroughputMbps: number | null;
  previousWeekAvailability: number | null;
}

export interface WeeklyReportInput {
  weekStart: Date;
  weekEnd: Date;
  devices: Device[];
  /** Incidents (type `device_unreachable`) chevauchant la semaine. */
  incidents: MonitoringEvent[];
  /** Tous les événements démarrés pendant la semaine, pour les compteurs par catégorie. */
  eventsInWeek: MonitoringEvent[];
  /** Signalements de sécurité encore ouverts à la fin de la semaine. */
  openSecurityEvents: MonitoringEvent[];
  averageThroughputMbps: number | null;
  previousWeekAvailability: number | null;
}

interface Interval {
  deviceId: string;
  start: number;
  end: number;
}

/** Ramène une panne à la portion qui tombe dans la semaine analysée. */
function clipToWeek(event: MonitoringEvent, start: number, end: number): Interval | null {
  const eventStart = Math.max(event.startedAt.getTime(), start);
  const eventEnd = Math.min((event.resolvedAt ?? new Date(end)).getTime(), end);
  if (eventEnd <= eventStart) return null;
  return { deviceId: event.deviceId, start: eventStart, end: eventEnd };
}

function toMinutes(ms: number): number {
  return Math.round(ms / MS_PER_MINUTE);
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 1 : Math.max(0, Math.min(1, value / total));
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const start = input.weekStart.getTime();
  const end = input.weekEnd.getTime();
  const weekDurationMs = Math.max(1, end - start);

  const monitored = input.devices.filter(isMonitored);
  const nameById = new Map(input.devices.map((d) => [d.id, deviceDisplayName(d)]));
  const deviceById = new Map(input.devices.map((d) => [d.id, d]));

  const intervals = input.incidents
    .map((event) => clipToWeek(event, start, end))
    .filter((interval): interval is Interval => interval !== null)
    // Seules les machines encore surveillées entrent dans le rapport.
    .filter((interval) => {
      const device = deviceById.get(interval.deviceId);
      return device !== undefined && isMonitored(device);
    });

  // Indisponibilité cumulée par machine
  const byDevice = new Map<string, { downtimeMs: number; longestMs: number; count: number }>();
  for (const interval of intervals) {
    const durationMs = interval.end - interval.start;
    const current = byDevice.get(interval.deviceId) ?? { downtimeMs: 0, longestMs: 0, count: 0 };
    current.downtimeMs += durationMs;
    current.longestMs = Math.max(current.longestMs, durationMs);
    current.count += 1;
    byDevice.set(interval.deviceId, current);
  }

  const topOutagesByDowntime: OutageSummary[] = [...byDevice.entries()]
    .map(([deviceId, stats]) => ({
      deviceId,
      deviceName: nameById.get(deviceId) ?? deviceId,
      critical: deviceById.get(deviceId)?.critical ?? false,
      outageCount: stats.count,
      downtimeMinutes: toMinutes(stats.downtimeMs),
      longestOutageMinutes: toMinutes(stats.longestMs),
      availability: ratio(weekDurationMs - stats.downtimeMs, weekDurationMs),
    }))
    .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes || Number(b.critical) - Number(a.critical));

  const totalDowntimeMs = intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
  const availability = ratio(
    monitored.length * weekDurationMs - totalDowntimeMs,
    monitored.length * weekDurationMs,
  );

  const eventsByCategory: Record<EventCategory, number> = {
    incident: 0,
    observation: 0,
    signalement: 0,
    configuration: 0,
  };
  for (const event of input.eventsInWeek) {
    eventsByCategory[event.category] += 1;
  }

  const report: WeeklyReport = {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    headline: '',
    devicesMonitored: monitored.length,
    devicesImpacted: byDevice.size,
    totalDowntimeMinutes: toMinutes(totalDowntimeMs),
    availability,
    topOutagesByDowntime: topOutagesByDowntime.slice(0, 10),
    topOutagesByImpact: buildEpisodes(intervals, nameById).slice(0, 5),
    eventsByCategory,
    newDevices: input.eventsInWeek.filter((e) => e.type === 'device_discovered').length,
    openSecurityFindings: input.openSecurityEvents.map((event) => ({
      deviceName: nameById.get(event.deviceId) ?? event.deviceId,
      summary: event.summary,
      severity: event.severity,
    })),
    averageThroughputMbps: input.averageThroughputMbps,
    previousWeekAvailability: input.previousWeekAvailability,
  };

  return { ...report, headline: buildHeadline(report) };
}

/**
 * Regroupe les pannes qui se chevauchent : une coupure de switch apparaît ainsi
 * comme un seul épisode touchant plusieurs machines, et non comme N pannes isolées.
 */
function buildEpisodes(intervals: Interval[], nameById: Map<string, string>): OutageEpisode[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const episodes: OutageEpisode[] = [];

  let currentStart = 0;
  let currentEnd = 0;
  let devices = new Set<string>();

  const flush = () => {
    if (devices.size === 0) return;
    episodes.push({
      startedAt: new Date(currentStart),
      endedAt: new Date(currentEnd),
      devicesImpacted: devices.size,
      deviceNames: [...devices].map((id) => nameById.get(id) ?? id),
      durationMinutes: toMinutes(currentEnd - currentStart),
    });
  };

  for (const interval of sorted) {
    if (devices.size === 0) {
      currentStart = interval.start;
      currentEnd = interval.end;
      devices = new Set([interval.deviceId]);
      continue;
    }

    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      devices.add(interval.deviceId);
    } else {
      flush();
      currentStart = interval.start;
      currentEnd = interval.end;
      devices = new Set([interval.deviceId]);
    }
  }
  flush();

  return episodes.sort(
    (a, b) => b.devicesImpacted - a.devicesImpacted || b.durationMinutes - a.durationMinutes,
  );
}

/** Résumé en français courant : c'est la seule chose que lira un gestionnaire pressé. */
function buildHeadline(report: WeeklyReport): string {
  const percent = (report.availability * 100).toFixed(2).replace('.', ',');
  const sentences: string[] = [];

  if (report.devicesImpacted === 0) {
    sentences.push(
      `Aucune panne cette semaine sur les ${report.devicesMonitored} équipements surveillés.`,
    );
  } else {
    const worst = report.topOutagesByDowntime[0];
    sentences.push(
      `${report.devicesImpacted} équipement(s) sur ${report.devicesMonitored} ont connu une panne, ` +
        `pour ${report.totalDowntimeMinutes} minutes d'indisponibilité cumulée (disponibilité ${percent} %).`,
    );
    if (worst) {
      sentences.push(
        `Le plus touché est ${worst.deviceName} : ${worst.downtimeMinutes} minutes hors service ` +
          `en ${worst.outageCount} panne(s).`,
      );
    }
    const biggest = report.topOutagesByImpact[0];
    if (biggest && biggest.devicesImpacted > 1) {
      sentences.push(
        `La coupure la plus large a touché ${biggest.devicesImpacted} machines en même temps ` +
          `pendant ${biggest.durationMinutes} minutes.`,
      );
    }
  }

  if (report.previousWeekAvailability !== null) {
    const delta = (report.availability - report.previousWeekAvailability) * 100;
    const trend = delta >= 0.01 ? 'en amélioration' : delta <= -0.01 ? 'en recul' : 'stable';
    sentences.push(`Tendance ${trend} par rapport à la semaine précédente.`);
  }

  if (report.openSecurityFindings.length > 0) {
    sentences.push(
      `${report.openSecurityFindings.length} signalement(s) de sécurité restent à traiter.`,
    );
  }

  if (report.newDevices > 0) {
    sentences.push(`${report.newDevices} nouvel(le)(s) machine(s) détectée(s) à identifier.`);
  }

  return sentences.join(' ');
}
