import type { DependencyRepository } from '../../../application/ports/repositories.js';
import type { Dependency, DependencySource, DependencyStatus } from '../../../domain/entities/dependency.js';
import type { Database } from './pool.js';

interface DependencyRow {
  id: string;
  device_id: string;
  depends_on_id: string;
  source: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  observed_at: Date | null;
}

function toDependency(row: DependencyRow): Dependency {
  return {
    id: row.id,
    deviceId: row.device_id,
    dependsOnId: row.depends_on_id,
    source: row.source as DependencySource,
    status: row.status as DependencyStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    observedAt: row.observed_at,
  };
}

const UPSERT = `
  insert into device_dependencies (id, device_id, depends_on_id, source, status, created_at, updated_at, observed_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8)
  on conflict (id) do update set
    depends_on_id = excluded.depends_on_id,
    source = excluded.source,
    status = excluded.status,
    updated_at = excluded.updated_at,
    observed_at = excluded.observed_at
`;

function toParams(d: Dependency): unknown[] {
  return [d.id, d.deviceId, d.dependsOnId, d.source, d.status, d.createdAt, d.updatedAt, d.observedAt];
}

export class PostgresDependencyRepository implements DependencyRepository {
  constructor(private readonly db: Database) {}

  async list(): Promise<Dependency[]> {
    const { rows } = await this.db.query<DependencyRow>('select * from device_dependencies order by created_at, id');
    return rows.map(toDependency);
  }

  async findById(id: string): Promise<Dependency | null> {
    const { rows } = await this.db.query<DependencyRow>('select * from device_dependencies where id = $1', [id]);
    return rows[0] ? toDependency(rows[0]) : null;
  }

  async insertMany(dependencies: Dependency[]): Promise<void> {
    await this.writeAll(dependencies);
  }

  async saveMany(dependencies: Dependency[]): Promise<void> {
    await this.writeAll(dependencies);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.query('delete from device_dependencies where id = any($1::text[])', [ids]);
  }

  private async writeAll(dependencies: Dependency[]): Promise<void> {
    if (dependencies.length === 0) return;
    const client = await this.db.connect();
    try {
      await client.query('begin');
      for (const dependency of dependencies) await client.query(UPSERT, toParams(dependency));
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
