import { loadEnv } from '../../config/env.js';
import { createPool, waitForDatabase } from './pool.js';
import { runMigrations } from './migrate.js';

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.log('STORAGE=memory : aucune base à migrer.');
  process.exit(0);
}
const pool = createPool(env.DATABASE_URL);

try {
  await waitForDatabase(pool);
  const executed = await runMigrations(pool);
  console.log(executed.length === 0 ? 'Base déjà à jour.' : `Migrations appliquées : ${executed.join(', ')}`);
} finally {
  await pool.end();
}
