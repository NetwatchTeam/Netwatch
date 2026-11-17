import type { ScanRunRepository } from '../../../application/ports/repositories.js';
import type { ScanRun, ScanRunStatus } from '../../../domain/entities/measurement.js';
import type { Database } from './pool.js';

interface ScanRunRow {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  devices_seen: number;
  events_raised: number;
  error: string | null;
}

function toScanRun(row: ScanRunRow): ScanRun {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as ScanRunStatus,
    devicesSeen: row.devices_seen,
    eventsRaised: row.events_raised,
    error: row.error,
  };
}

export class PostgresScanRunRepository implements ScanRunRepository {
  constructor(private readonly db: Database) {}

  async start(run: ScanRun): Promise<void> {
    await this.db.query(
      `insert into scan_runs (id, started_at, finished_at, status, devices_seen, events_raised, error)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [run.id, run.startedAt, run.finishedAt, run.status, run.devicesSeen, run.eventsRaised, run.error],
    );
  }

  async finish(run: ScanRun): Promise<void> {
    await this.db.query(
      `update scan_runs set finished_at = $2, status = $3, devices_seen = $4, events_raised = $5, error = $6
       where id = $1`,
      [run.id, run.finishedAt, run.status, run.devicesSeen, run.eventsRaised, run.error],
    );
  }

  async last(): Promise<ScanRun | null> {
    const { rows } = await this.db.query<ScanRunRow>(
      'select * from scan_runs order by started_at desc limit 1',
    );
    return rows[0] ? toScanRun(rows[0]) : null;
  }

  async list(limit: number): Promise<ScanRun[]> {
    const { rows } = await this.db.query<ScanRunRow>(
      'select * from scan_runs order by started_at desc limit $1',
      [Math.min(limit, 200)],
    );
    return rows.map(toScanRun);
  }
}
