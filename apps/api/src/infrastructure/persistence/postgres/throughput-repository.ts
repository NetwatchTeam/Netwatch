import type { ThroughputRepository } from '../../../application/ports/repositories.js';
import type { ThroughputSample } from '../../../domain/entities/measurement.js';
import type { Database } from './pool.js';

interface SampleRow {
  id: string;
  source_device_id: string;
  target_device_id: string | null;
  mbps: number;
  measured_at: Date;
}

function toSample(row: SampleRow): ThroughputSample {
  return {
    id: row.id,
    sourceDeviceId: row.source_device_id,
    targetDeviceId: row.target_device_id,
    mbps: row.mbps,
    measuredAt: row.measured_at,
  };
}

export class PostgresThroughputRepository implements ThroughputRepository {
  constructor(private readonly db: Database) {}

  async insertMany(samples: ThroughputSample[]): Promise<void> {
    if (samples.length === 0) return;

    const values: string[] = [];
    const params: unknown[] = [];
    for (const sample of samples) {
      const offset = params.length;
      values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5})`);
      params.push(sample.id, sample.sourceDeviceId, sample.targetDeviceId, sample.mbps, sample.measuredAt);
    }

    await this.db.query(
      `insert into throughput_samples (id, source_device_id, target_device_id, mbps, measured_at)
       values ${values.join(', ')}`,
      params,
    );
  }

  async listBetween(from: Date, to: Date, deviceId?: string): Promise<ThroughputSample[]> {
    const params: unknown[] = [from, to];
    let filter = '';
    if (deviceId) {
      params.push(deviceId);
      filter = `and (source_device_id = $3 or target_device_id = $3)`;
    }

    const { rows } = await this.db.query<SampleRow>(
      `select * from throughput_samples
       where measured_at >= $1 and measured_at <= $2 ${filter}
       order by measured_at`,
      params,
    );
    return rows.map(toSample);
  }

  async averageBetween(from: Date, to: Date): Promise<number | null> {
    const { rows } = await this.db.query<{ avg: string | null }>(
      'select avg(mbps) as avg from throughput_samples where measured_at >= $1 and measured_at <= $2',
      [from, to],
    );
    const value = rows[0]?.avg;
    return value === null || value === undefined ? null : Number(value);
  }

  async baseline(sourceDeviceId: string, targetDeviceId: string | null, since: Date): Promise<number | null> {
    // Médiane plutôt que moyenne : une dégradation passée ne doit pas abaisser la référence.
    const { rows } = await this.db.query<{ median: string | null }>(
      `select percentile_cont(0.5) within group (order by mbps) as median
       from throughput_samples
       where source_device_id = $1
         and target_device_id is not distinct from $2
         and measured_at >= $3`,
      [sourceDeviceId, targetDeviceId, since],
    );
    const value = rows[0]?.median;
    return value === null || value === undefined ? null : Number(value);
  }

  async deleteBefore(date: Date): Promise<number> {
    const result = await this.db.query('delete from throughput_samples where measured_at < $1', [date]);
    return result.rowCount ?? 0;
  }
}
