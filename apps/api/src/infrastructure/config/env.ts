import { z } from 'zod';
import { DEV_HINT, StartupError } from '../system/startup-error.js';

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  /**
   * `postgres` (défaut) conserve les données ; `memory` les garde en mémoire, perdues à l'arrêt :
   * pratique pour développer le tableau de bord sans base, avec SCANNER_MODE=demo.
   */
  STORAGE: z.enum(['postgres', 'memory']).default('postgres'),
  DATABASE_URL: z.string().min(1).optional(),

  /**
   * `http` interroge le scanner ; `demo` génère un réseau fictif pour une démonstration ;
   * `none` : aucun scan automatique, les données n'arrivent que par injection (`npm run scan:inject`).
   */
  SCANNER_MODE: z.enum(['http', 'demo', 'none']).default('demo'),
  SCANNER_URL: z.string().url().optional(),
  SCANNER_TOKEN: z.string().optional(),
  SCANNER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  /**
   * `POST /api/v1/scans/import` : injecter une photographie fictive (`npm run scan:inject`).
   * Absente : activée hors production, désactivée en production (n'importe qui sur le réseau pourrait
   * sinon injecter de fausses données).
   */
  SCAN_IMPORT: z.enum(['enabled', 'disabled']).optional(),

  /** Fuseau horaire des heures affichées dans le rapport PDF. */
  REPORT_TIME_ZONE: z
    .string()
    .default('Europe/Paris')
    .refine(isValidTimeZone, 'REPORT_TIME_ZONE doit être un fuseau IANA, ex. Europe/Paris'),

  /** Origine autorisée en développement, quand l'interface tourne sur un autre port. */
  CORS_ORIGIN: z.string().optional(),
  /** Dossier des fichiers de l'interface compilée, servis par l'API en production. */
  WEB_DIST_PATH: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function isScanImportEnabled(env: Pick<Env, 'SCAN_IMPORT' | 'NODE_ENV'>): boolean {
  return env.SCAN_IMPORT ? env.SCAN_IMPORT === 'enabled' : env.NODE_ENV !== 'production';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`);
    throw new StartupError(
      `Configuration invalide :\n${details.join('\n')}\n\n` +
        'Corrigez la variable dans apps/api/.env (modèle : apps/api/.env.example), ou dans le .env racine avec Docker.',
    );
  }

  if (parsed.data.STORAGE === 'postgres' && !parsed.data.DATABASE_URL) {
    throw new StartupError(
      'DATABASE_URL est absente : l’API ne sait pas à quelle base PostgreSQL se connecter.\n' +
        'C’est le cas quand on lance `npm run dev` sans avoir créé apps/api/.env.\n\n' +
        DEV_HINT,
    );
  }

  if (parsed.data.SCANNER_MODE === 'http' && !parsed.data.SCANNER_URL) {
    throw new StartupError(
      'SCANNER_MODE=http mais SCANNER_URL est vide : indiquez l’adresse du collecteur\n' +
        '(collecteur simulé en développement : SCANNER_URL=http://localhost:8090), ou passez SCANNER_MODE=demo.',
    );
  }

  return parsed.data;
}
