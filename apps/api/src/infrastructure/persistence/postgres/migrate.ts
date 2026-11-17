import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './pool.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../migrations');

/**
 * Migrations en SQL brut, appliquées une seule fois et dans l'ordre des noms de fichiers.
 * Volontairement minimal : pas d'outil supplémentaire à installer chez le client.
 */
export async function runMigrations(pool: Database): Promise<string[]> {
  await pool.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = await pool.query<{ name: string }>('select name from schema_migrations');
  const alreadyApplied = new Set(applied.rows.map((row) => row.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  const executed: string[] = [];

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      executed.push(file);
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${file} en échec : ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  return executed;
}
