import { createHash, timingSafeEqual } from 'node:crypto';
import type { SessionUserDto, UserRole } from '@netwatch/contracts';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Env } from '../../../infrastructure/config/env.js';

export const SESSION_COOKIE = 'netwatch_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUserDto;
    }
  }
}

/**
 * Verrou provisoire : un mot de passe unique protège l'accès au tableau de bord.
 * Les rôles existent déjà dans le modèle, mais toute session reçoit `admin`.
 * Étape suivante avant commercialisation : comptes nominatifs, mots de passe
 * hachés en base, et `requireRole` réellement appliqué sur les routes sensibles.
 */
export function verifyPassword(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function issueSession(env: Env): { token: string; user: SessionUserDto; maxAgeMs: number } {
  const user: SessionUserDto = { id: 'shared', displayName: 'Utilisateur NetWatch', role: 'admin' };
  const maxAgeMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const token = jwt.sign(user, env.SESSION_SECRET, { expiresIn: `${env.SESSION_TTL_HOURS}h` });
  return { token, user, maxAgeMs };
}

export function readSession(req: Request, env: Env): SessionUserDto | null {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.SESSION_SECRET) as SessionUserDto;
    return { id: payload.id, displayName: payload.displayName, role: payload.role };
  } catch {
    return null;
  }
}

export function requireAuth(env: Env) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = readSession(req, env);
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Authentification requise' } });
      return;
    }
    req.user = user;
    next();
  };
}

/**
 * Les rôles sont déclarés dès maintenant pour figer les intentions,
 * mais ne restreignent encore rien : toute session authentifiée est admin.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (role && roles.length > 0 && !roles.includes(role) && role !== 'admin') {
      res.status(403).json({ error: { code: 'forbidden', message: 'Droits insuffisants' } });
      return;
    }
    next();
  };
}
