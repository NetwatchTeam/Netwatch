import { loadEnv } from '../../config/env.js';
import { createPool, waitForDatabase } from './pool.js';
import { runMigrations } from './migrate.js';

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);

try {
  await waitForDatabase(pool);
  const executed = await runMigrations(pool);
  console.log(executed.length === 0 ? 'Base déjà à jour.' : `Migrations appliquées : ${executed.join(', ')}`);
} finally {
  await pool.end();
}
