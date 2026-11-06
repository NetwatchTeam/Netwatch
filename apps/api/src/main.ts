import { buildContainer, buildInMemoryContainer, type AppContainer } from './container.js';
import { loadEnv } from './infrastructure/config/env.js';
import { runMigrations } from './infrastructure/persistence/postgres/migrate.js';
import { createPool, waitForDatabase } from './infrastructure/persistence/postgres/pool.js';
import { ScanScheduler } from './infrastructure/scheduler/scan-scheduler.js';
import { createLogger } from './infrastructure/system/index.js';
import { createServer } from './interfaces/http/server.js';

const logger = createLogger();
const env = loadEnv();
const pool = env.STORAGE === 'postgres' ? createPool(env.DATABASE_URL!) : null;

let container: AppContainer;
if (pool) {
  await waitForDatabase(pool);
  const executed = await runMigrations(pool);
  if (executed.length > 0) logger.info('Migrations appliquées', { migrations: executed });
  container = buildContainer(pool, env, logger);
} else {
  logger.warn('Stockage en mémoire : les données seront perdues à l’arrêt (STORAGE=memory)');
  container = buildInMemoryContainer(env, logger);
}
const app = createServer(container, env, logger);

const scheduler = new ScanScheduler(
  container.runScan,
  container.purgeExpiredData,
  container.getSettings,
  logger,
);

const server = app.listen(env.PORT, () => {
  logger.info('API démarrée', { port: env.PORT, scannerMode: env.SCANNER_MODE, storage: env.STORAGE });
  scheduler.start();
});

const shutdown = (signal: string) => {
  logger.info('Arrêt en cours', { signal });
  scheduler.stop();
  server.close(() => {
    void (pool ? pool.end() : Promise.resolve()).then(() => process.exit(0));
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
