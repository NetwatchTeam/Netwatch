import type { EventQuery, EventRepository } from '../../../application/ports/repositories.js';
import type {
  EventCategory,
  EventDetails,
  EventSeverity,
  EventStatus,
  EventType,
  MonitoringEvent,
} from '../../../domain/entities/monitoring-event.js';
import type { Database } from './pool.js';

interface EventRow {
  id: string;
  device_id: string;
  peer_device_id: string | null;
  type: string;
  category: string;
  severity: string;
  status: string;
  summary: string;
  details: EventDetails;
  dedupe_key: string;
  started_at: Date;
  resolved_at: Date | null;
  acknowledged_at: Date | null;
}

function toEvent(row: EventRow): MonitoringEvent {
  return {
    id: row.id,
    deviceId: row.device_id,
    peerDeviceId: row.peer_device_id,
    type: row.type as EventType,
    category: row.category as EventCategory,
    severity: row.severity as EventSeverity,
    status: row.status as EventStatus,
    summary: row.summary,
    details: row.details ?? {},
    dedupeKey: row.dedupe_key,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly db: Database) {}

  async list(query: EventQuery = {}): Promise<MonitoringEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.category) {
      params.push(query.category);
      conditions.push(`category = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }
    if (query.deviceId) {
      params.push(query.deviceId);
      conditions.push(`(device_id = $${params.length} or peer_device_id = $${params.length})`);
    }
    if (query.since) {
      params.push(query.since);
      conditions.push(`started_at >= $${params.length}`);
    }

    params.push(Math.min(query.limit ?? 200, 500));
    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const { rows } = await this.db.query<EventRow>(
      `select * from monitoring_events ${where} order by started_at desc limit $${params.length}`,
      params,
    );
    return rows.map(toEvent);
  }

  async findById(id: string): Promise<MonitoringEvent | null> {
    const { rows } = await this.db.query<EventRow>('select * from monitoring_events where id = $1', [id]);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async findOpen(): Promise<MonitoringEvent[]> {
    const { rows } = await this.db.query<EventRow>(
      `select * from monitoring_events where status <> 'resolved' order by started_at desc`,
    );
    return rows.map(toEvent);
  }

  async findOverlapping(type: EventType, from: Date, to: Date): Promise<MonitoringEvent[]> {
    const { rows } = await this.db.query<EventRow>(
      `select * from monitoring_events
       where type = $1 and started_at < $3 and (resolved_at is null or resolved_at > $2)
       order by started_at`,
      [type, from, to],
    );
    return rows.map(toEvent);
  }

  async findStartedBetween(from: Date, to: Date): Promise<MonitoringEvent[]> {
    const { rows } = await this.db.query<EventRow>(
      'select * from monitoring_events where started_at >= $1 and started_at < $2 order by started_at',
      [from, to],
    );
    return rows.map(toEvent);
  }

  async insertMany(events: MonitoringEvent[]): Promise<void> {
    if (events.length === 0) return;

    const client = await this.db.connect();
    try {
      await client.query('begin');
      for (const event of events) {
        // `do nothing` en cas de course avec un autre scan : l'index partiel
        // garantit un seul événement ouvert par (équipement, cause).
        await client.query(
          `insert into monitoring_events (
             id, device_id, peer_device_id, type, category, severity, status, summary,
             details, dedupe_key, started_at, resolved_at, acknowledged_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
           on conflict do nothing`,
          [
            event.id,
            event.deviceId,
            event.peerDeviceId,
            event.type,
            event.category,
            event.severity,
            event.status,
            event.summary,
            JSON.stringify(event.details),
            event.dedupeKey,
            event.startedAt,
            event.resolvedAt,
            event.acknowledgedAt,
          ],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async save(event: MonitoringEvent): Promise<void> {
    await this.db.query(
      `update monitoring_events set
         severity = $2, status = $3, summary = $4, details = $5::jsonb,
         resolved_at = $6, acknowledged_at = $7
       where id = $1`,
      [
        event.id,
        event.severity,
        event.status,
        event.summary,
        JSON.stringify(event.details),
        event.resolvedAt,
        event.acknowledgedAt,
      ],
    );
  }

  async deleteResolvedBefore(date: Date): Promise<number> {
    const result = await this.db.query(
      `delete from monitoring_events where status = 'resolved' and resolved_at < $1`,
      [date],
    );
    return result.rowCount ?? 0;
  }
}
