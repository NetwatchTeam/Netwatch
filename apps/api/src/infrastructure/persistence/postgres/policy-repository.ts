import type { PolicyRepository } from '../../../application/ports/repositories.js';
import { DEFAULT_POLICY, type MonitoringPolicy } from '../../../domain/policy.js';
import type { Database } from './pool.js';

/**
 * Les réglages sont stockés en JSON et fusionnés avec les valeurs par défaut :
 * une nouvelle option ajoutée au produit s'applique sans migration de données.
 */
export class PostgresPolicyRepository implements PolicyRepository {
  constructor(private readonly db: Database) {}

  async get(): Promise<MonitoringPolicy> {
    const { rows } = await this.db.query<{ data: Partial<MonitoringPolicy> }>(
      'select data from monitoring_settings where id = 1',
    );
    return { ...DEFAULT_POLICY, ...(rows[0]?.data ?? {}) };
  }

  async update(patch: Partial<MonitoringPolicy>): Promise<MonitoringPolicy> {
    const merged = { ...(await this.get()), ...patch };
    await this.db.query(
      `insert into monitoring_settings (id, data, updated_at) values (1, $1::jsonb, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [JSON.stringify(merged)],
    );
    return merged;
  }
}
