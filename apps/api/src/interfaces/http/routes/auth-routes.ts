import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../../infrastructure/config/env.js';
import { SESSION_COOKIE, issueSession, readSession, verifyPassword } from '../middleware/auth.js';

const loginSchema = z.object({ password: z.string().min(1) });

export function authRoutes(env: Env): Router {
  const router = Router();

  router.post('/auth/login', (req, res) => {
    const { password } = loginSchema.parse(req.body);

    if (!verifyPassword(password, env.APP_PASSWORD)) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Mot de passe incorrect' } });
      return;
    }

    const { token, user, maxAgeMs } = issueSession(env);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: maxAgeMs,
      path: '/',
    });
    res.json(user);
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/auth/me', (req, res) => {
    const user = readSession(req, env);
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Session expirée' } });
      return;
    }
    res.json(user);
  });

  return router;
}
