import { buildWeeklyReport, type WeeklyReport } from '../../domain/reporting/weekly-report.js';
import type { DeviceRepository, EventRepository, ThroughputRepository } from '../ports/repositories.js';
import type { Clock } from '../ports/system.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Lundi 00:00 (UTC) de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = (start.getUTCDay() + 6) % 7; // 0 = lundi
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  return start;
}

/**
 * Rapport hebdomadaire du gestionnaire : les pannes les plus coûteuses,
 * en durée et en nombre de machines touchées.
 */
export class GenerateWeeklyReport {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: EventRepository,
    private readonly throughput: ThroughputRepository,
    private readonly clock: Clock,
  ) {}

  async execute(reference: Date = this.clock.now()): Promise<WeeklyReport> {
    const now = this.clock.now();
    const weekStart = startOfWeek(reference);
    // Une semaine en cours s'arrête à maintenant : sinon la disponibilité
    // serait calculée sur des jours qui n'ont pas encore eu lieu.
    const weekEnd = new Date(Math.min(weekStart.getTime() + WEEK_MS, now.getTime()));

    const [devices, incidents, eventsInWeek, openEvents, averageThroughputMbps] = await Promise.all([
      this.devices.findAll(),
      this.events.findOverlapping('device_unreachable', weekStart, weekEnd),
      this.events.findStartedBetween(weekStart, weekEnd),
      this.events.findOpen(),
      this.throughput.averageBetween(weekStart, weekEnd),
    ]);

    const previousStart = new Date(weekStart.getTime() - WEEK_MS);
    const previousIncidents = await this.events.findOverlapping('device_unreachable', previousStart, weekStart);
    const previous = buildWeeklyReport({
      weekStart: previousStart,
      weekEnd: weekStart,
      devices,
      incidents: previousIncidents,
      eventsInWeek: [],
      openSecurityEvents: [],
      averageThroughputMbps: null,
      previousWeekAvailability: null,
    });

    return buildWeeklyReport({
      weekStart,
      weekEnd,
      devices,
      incidents,
      eventsInWeek,
      openSecurityEvents: openEvents.filter((event) => event.category === 'signalement'),
      averageThroughputMbps,
      previousWeekAvailability: previousIncidents.length > 0 ? previous.availability : null,
    });
  }
}
