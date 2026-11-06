import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '@netwatch/contracts';
import cors from 'cors';
import express, { type Express } from 'express';
import type { Logger } from '../../application/ports/system.js';
import type { AppContainer } from '../../container.js';
import type { Env } from '../../infrastructure/config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { dashboardRoutes } from './routes/dashboard-routes.js';
import { dependencyRoutes } from './routes/dependency-routes.js';
import { deviceRoutes } from './routes/device-routes.js';
import { eventRoutes } from './routes/event-routes.js';
import { operationsRoutes } from './routes/operations-routes.js';

export function createServer(container: AppContainer, env: Env, logger: Logger): Express {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  if (env.CORS_ORIGIN) {
    // Utile en développement : l'interface tourne sur le port de Vite.
    app.use(cors({ origin: env.CORS_ORIGIN, exposedHeaders: [CONTRACT_VERSION_HEADER] }));
  }

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', contractVersion: CONTRACT_VERSION });
  });

  // Accès libre : aucune authentification n'est demandée. Le tableau de bord
  // doit donc rester sur un réseau de confiance (voir README).
  const api = express.Router();
  // Chaque réponse annonce la version du contrat qu'elle respecte.
  api.use((_req, res, next) => {
    res.setHeader(CONTRACT_VERSION_HEADER, CONTRACT_VERSION);
    next();
  });
  api.use(deviceRoutes(container));
  api.use(dependencyRoutes(container));
  api.use(eventRoutes(container));
  api.use(dashboardRoutes(container, { reportTimeZone: env.REPORT_TIME_ZONE }));
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
