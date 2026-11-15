import type { DeviceDecisionRepository } from '../../../application/ports/repositories.js';
import type { DeviceDecision, DeviceDecisionAction } from '../../../domain/entities/device-decision.js';
import type { DeviceKind, DeviceLifecycle } from '../../../domain/entities/device.js';
import type { Database } from './pool.js';

interface DeviceDecisionRow {
  id: string;
  device_id: string;
  action: string;
  author: string;
  decided_at: Date;
  previous_lifecycle: string | null;
  lifecycle: string;
  kind: string;
  label: string | null;
  critical: boolean;
}

function toDecision(row: DeviceDecisionRow): DeviceDecision {
  return {
    id: row.id,
    deviceId: row.device_id,
    action: row.action as DeviceDecisionAction,
    author: row.author,
    decidedAt: row.decided_at,
    previousLifecycle: row.previous_lifecycle as DeviceLifecycle | null,
    lifecycle: row.lifecycle as DeviceLifecycle,
    kind: row.kind as DeviceKind,
    label: row.label,
    critical: row.critical,
  };
}

export class PostgresDeviceDecisionRepository implements DeviceDecisionRepository {
  constructor(private readonly db: Database) {}

  async insert(decision: DeviceDecision): Promise<void> {
    await this.db.query(
      `insert into device_decisions
         (id, device_id, action, author, decided_at, previous_lifecycle, lifecycle, kind, label, critical)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        decision.id,
        decision.deviceId,
        decision.action,
        decision.author,
        decision.decidedAt,
        decision.previousLifecycle,
        decision.lifecycle,
        decision.kind,
        decision.label,
        decision.critical,
      ],
    );
  }

  async listByDevice(deviceId: string, limit = 50): Promise<DeviceDecision[]> {
    const { rows } = await this.db.query<DeviceDecisionRow>(
      'select * from device_decisions where device_id = $1 order by decided_at desc, id desc limit $2',
      [deviceId, Math.min(limit, 500)],
    );
    return rows.map(toDecision);
  }
}
