import pg from 'pg';

export type Database = pg.Pool;

export function createPool(connectionString: string): Database {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export async function waitForDatabase(pool: Database, attempts = 30, delayMs = 1_000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      // Au démarrage en conteneur, PostgreSQL peut être plus lent que l'API.
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
