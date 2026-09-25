import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL est obligatoire'),

  /** `http` interroge le scanner ; `demo` génère un réseau fictif pour une démonstration. */
  SCANNER_MODE: z.enum(['http', 'demo']).default('demo'),
  SCANNER_URL: z.string().url().optional(),
  SCANNER_TOKEN: z.string().optional(),
  SCANNER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  /** Mot de passe unique d'accès au tableau de bord (verrou provisoire, voir README). */
  APP_PASSWORD: z.string().min(8, 'APP_PASSWORD doit faire au moins 8 caractères'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  /** Origine autorisée en développement, quand l'interface tourne sur un autre port. */
  CORS_ORIGIN: z.string().optional(),
  /** Dossier des fichiers de l'interface compilée, servis par l'API en production. */
  WEB_DIST_PATH: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuration invalide :\n${details.join('\n')}`);
  }

  if (parsed.data.SCANNER_MODE === 'http' && !parsed.data.SCANNER_URL) {
    throw new Error('Configuration invalide :\n  - SCANNER_URL est obligatoire quand SCANNER_MODE=http');
  }

  return parsed.data;
}
