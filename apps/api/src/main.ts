import { buildContainer, buildInMemoryContainer, type AppContainer } from './container.js';
import { loadEnv, type Env } from './infrastructure/config/env.js';
import { runMigrations } from './infrastructure/persistence/postgres/migrate.js';
import { createPool, waitForDatabase } from './infrastructure/persistence/postgres/pool.js';
import { ScanScheduler } from './infrastructure/scheduler/scan-scheduler.js';
import { createLogger } from './infrastructure/system/index.js';
import { StartupError } from './infrastructure/system/startup-error.js';
import { createServer } from './interfaces/http/server.js';

/**
 * Un problème de configuration ou d'environnement s'affiche comme un message à suivre,
 * pas comme une trace de pile : c'est souvent la première chose que voit un nouveau venu.
 */
function failStartup(error: unknown): never {
  if (error instanceof StartupError) {
    console.error(`\nNetWatch ne peut pas démarrer.\n\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger();

let env: Env;
try {
  env = loadEnv();
} catch (error) {
  failStartup(error);
}

const pool = env.STORAGE === 'postgres' ? createPool(env.DATABASE_URL!) : null;

let container: AppContainer;
if (pool) {
  try {
    await waitForDatabase(pool, env.DATABASE_URL!, (message) => logger.info(message));
  } catch (error) {
    await pool.end().catch(() => undefined);
    failStartup(error);
  }
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
  env.SCANNER_MODE !== 'none',
);

const server = app.listen(env.PORT, () => {
  logger.info('API démarrée', { port: env.PORT, scannerMode: env.SCANNER_MODE, storage: env.STORAGE });
  scheduler.start();
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    failStartup(
      new StartupError(
        `Le port ${env.PORT} est déjà utilisé par un autre programme : souvent une autre API NetWatch\n` +
          '(un `npm run dev` lancé dans un autre terminal, ou la stack Docker : docker compose stop app).\n' +
          'Arrêtez-la, ou choisissez un autre port avec PORT dans apps/api/.env.',
      ),
    );
  }
  throw error;
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
