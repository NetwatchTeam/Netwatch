import { loadEnv, type Env } from '../../config/env.js';
import { StartupError } from '../../system/startup-error.js';
import { createPool, waitForDatabase } from './pool.js';
import { runMigrations } from './migrate.js';

function fail(error: unknown): never {
  if (error instanceof StartupError) {
    console.error(`\nMigration impossible.\n\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

let env: Env;
try {
  env = loadEnv();
} catch (error) {
  fail(error);
}

if (!env.DATABASE_URL) {
  console.log('STORAGE=memory : aucune base à migrer.');
  process.exit(0);
}
const pool = createPool(env.DATABASE_URL);

try {
  await waitForDatabase(pool, env.DATABASE_URL, console.log);
  const executed = await runMigrations(pool);
  console.log(executed.length === 0 ? 'Base déjà à jour.' : `Migrations appliquées : ${executed.join(', ')}`);
} catch (error) {
  await pool.end().catch(() => undefined);
  fail(error);
}
await pool.end();
