import { buildContainer } from './container.js';
import { loadEnv } from './infrastructure/config/env.js';
import { runMigrations } from './infrastructure/persistence/postgres/migrate.js';
import { createPool, waitForDatabase } from './infrastructure/persistence/postgres/pool.js';
import { ScanScheduler } from './infrastructure/scheduler/scan-scheduler.js';
import { createLogger } from './infrastructure/system/index.js';
import { createServer } from './interfaces/http/server.js';

const logger = createLogger();
const env = loadEnv();
const pool = createPool(env.DATABASE_URL);

await waitForDatabase(pool);
const executed = await runMigrations(pool);
if (executed.length > 0) logger.info('Migrations appliquées', { migrations: executed });

const container = buildContainer(pool, env, logger);
const app = createServer(container, env, logger);

const scheduler = new ScanScheduler(
  container.runScan,
  container.purgeExpiredData,
  container.getSettings,
  logger,
);

const server = app.listen(env.PORT, () => {
  logger.info('API démarrée', { port: env.PORT, scannerMode: env.SCANNER_MODE });
  scheduler.start();
});

const shutdown = (signal: string) => {
  logger.info('Arrêt en cours', { signal });
  scheduler.stop();
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
