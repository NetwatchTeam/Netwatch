import pg from 'pg';
import { DEV_HINT, StartupError } from '../../system/startup-error.js';

export type Database = pg.Pool;

export function createPool(connectionString: string): Database {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/** Hôte, port, utilisateur et base de DATABASE_URL — jamais le mot de passe. */
export function describeTarget(connectionString: string): { where: string; user: string; database: string } {
  try {
    const url = new URL(connectionString);
    return {
      where: `${url.hostname}:${url.port || '5432'}`,
      user: decodeURIComponent(url.username) || '(non précisé)',
      database: url.pathname.replace(/^\//, '') || '(non précisée)',
    };
  } catch {
    return { where: '(adresse illisible)', user: '?', database: '?' };
  }
}

/** Erreurs qui ne se régleront pas en attendant : inutile de réessayer. */
const PERMANENT = new Set(['28P01', '28000', '3D000']);

/**
 * Traduit une erreur de connexion en message actionnable pour la personne qui lance l'API.
 * Codes PostgreSQL : 28P01/28000 authentification, 3D000 base inexistante.
 */
export function explainDatabaseError(error: unknown, connectionString: string): StartupError {
  const { where, user, database } = describeTarget(connectionString);
  const code = (error as { code?: string } | null)?.code;

  if (code === '28P01' || code === '28000') {
    return new StartupError(
      `PostgreSQL (${where}) refuse le mot de passe de l’utilisateur « ${user} ».\n\n` +
        'Le mot de passe de DATABASE_URL (apps/api/.env) doit être le POSTGRES_PASSWORD du .env racine\n' +
        'tel qu’il était au PREMIER démarrage de la base : PostgreSQL le garde ensuite dans son volume.\n' +
        '  • Remettez ce mot de passe dans apps/api/.env,\n' +
        '  • ou repartez d’une base vide (efface les données) : docker compose down -v',
    );
  }

  if (code === '3D000') {
    return new StartupError(
      `La base « ${database} » n’existe pas sur ${where}.\n` +
        'Vérifiez la fin de DATABASE_URL : elle doit correspondre à POSTGRES_DB du .env racine (netwatch par défaut).',
    );
  }

  return new StartupError(
    `PostgreSQL ne répond pas à ${where} (adresse tirée de DATABASE_URL).\n` +
      'La base n’est pas démarrée, ou le port ne correspond pas (5433 pour la base de développement).\n\n' +
      DEV_HINT,
  );
}

export async function waitForDatabase(
  pool: Database,
  connectionString: string,
  log: (message: string) => void = () => {},
  attempts = 30,
  delayMs = 1_000,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt === attempts || (code && PERMANENT.has(code))) throw explainDatabaseError(error, connectionString);
      if (attempt === 1) log(`En attente de PostgreSQL sur ${describeTarget(connectionString).where}… (jusqu’à ${attempts} s)`);
      // Au démarrage en conteneur, PostgreSQL peut être plus lent que l'API.
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
