import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import type { Logger } from '../../application/ports/system.js';
import type { AppContainer } from '../../container.js';
import type { Env } from '../../infrastructure/config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './routes/auth-routes.js';
import { dashboardRoutes } from './routes/dashboard-routes.js';
import { deviceRoutes } from './routes/device-routes.js';
import { eventRoutes } from './routes/event-routes.js';
import { operationsRoutes } from './routes/operations-routes.js';

export function createServer(container: AppContainer, env: Env, logger: Logger): Express {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  if (env.CORS_ORIGIN) {
    // Utile en développement : l'interface tourne sur le port de Vite.
    app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  }

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(authRoutes(env));
  api.use(requireAuth(env));
  api.use(deviceRoutes(container));
  api.use(eventRoutes(container));
  api.use(dashboardRoutes(container));
  api.use(operationsRoutes(container));
  app.use('/api/v1', api);

  // En production, l'API sert aussi l'interface compilée : un seul conteneur à déployer.
  if (env.WEB_DIST_PATH && existsSync(env.WEB_DIST_PATH)) {
    const indexHtml = join(env.WEB_DIST_PATH, 'index.html');
    app.use(express.static(env.WEB_DIST_PATH));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler(logger));

  return app;
}
