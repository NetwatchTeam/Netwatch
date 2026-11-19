import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import {
  describeTarget,
  explainDatabaseError,
  waitForDatabase,
  type Database,
} from '../../src/infrastructure/persistence/postgres/pool.js';
import { StartupError } from '../../src/infrastructure/system/startup-error.js';

const URL = 'postgres://netwatch:mot-de-passe-secret@localhost:5433/netwatch';

/** Base factice : `query` échoue avec les erreurs données, dans l'ordre, puis réussit. */
function fakePool(errors: unknown[]): { pool: Database; calls: () => number } {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      const error = errors.shift();
      if (error) throw error;
      return { rows: [] };
    },
  } as unknown as Database;
  return { pool, calls: () => calls };
}

describe('erreurs de démarrage lisibles', () => {
  it('sans DATABASE_URL, explique les deux façons de lancer le projet', () => {
    expect(() => loadEnv({})).toThrow(StartupError);
    expect(() => loadEnv({})).toThrow(/npm run dev:demo[\s\S]*cp apps\/api\/\.env\.example apps\/api\/\.env/);
  });

  it('SCANNER_MODE=http sans adresse donne la valeur à utiliser', () => {
    expect(() => loadEnv({ STORAGE: 'memory', SCANNER_MODE: 'http' })).toThrow(/SCANNER_URL=http:\/\/localhost:8090/);
  });

  it('une valeur invalide renvoie vers le fichier à corriger', () => {
    expect(() => loadEnv({ STORAGE: 'memory', PORT: 'abc' })).toThrow(/PORT[\s\S]*apps\/api\/\.env/);
  });

  it('accepte le mode démo sans base ni collecteur', () => {
    expect(loadEnv({ STORAGE: 'memory', SCANNER_MODE: 'demo' })).toMatchObject({ STORAGE: 'memory' });
  });

  it('attend le collecteur 5 minutes par défaut, et pas davantage', () => {
    expect(loadEnv({ STORAGE: 'memory' }).SCANNER_TIMEOUT_MS).toBe(300_000);
    expect(() => loadEnv({ STORAGE: 'memory', SCANNER_TIMEOUT_MS: '600000' })).toThrow(/SCANNER_TIMEOUT_MS ne peut dépasser 300000/);
  });

  it('ne montre jamais le mot de passe de DATABASE_URL', () => {
    expect(describeTarget(URL)).toEqual({ where: 'localhost:5433', user: 'netwatch', database: 'netwatch' });
    for (const code of ['28P01', '3D000', 'ECONNREFUSED']) {
      expect(explainDatabaseError({ code }, URL).message).not.toContain('mot-de-passe-secret');
    }
  });

  it('distingue mauvais mot de passe, base inexistante et base arrêtée', () => {
    expect(explainDatabaseError({ code: '28P01' }, URL).message).toContain('refuse le mot de passe de l’utilisateur « netwatch »');
    expect(explainDatabaseError({ code: '3D000' }, URL).message).toContain('La base « netwatch » n’existe pas');
    expect(explainDatabaseError({ code: 'ECONNREFUSED' }, URL).message).toContain('PostgreSQL ne répond pas à localhost:5433');
  });

  it('abandonne aussitôt sur un mauvais mot de passe, sans attendre 30 secondes', async () => {
    const { pool, calls } = fakePool([{ code: '28P01' }, { code: '28P01' }]);
    await expect(waitForDatabase(pool, URL, () => {}, 30, 1)).rejects.toThrow(/refuse le mot de passe/);
    expect(calls()).toBe(1);
  });

  it('attend une base qui démarre, puis se connecte', async () => {
    const messages: string[] = [];
    const { pool, calls } = fakePool([{ code: 'ECONNREFUSED' }, { code: 'ECONNREFUSED' }]);
    await waitForDatabase(pool, URL, (message) => messages.push(message), 5, 1);
    expect(calls()).toBe(3);
    expect(messages).toEqual(['En attente de PostgreSQL sur localhost:5433… (jusqu’à 5 s)']);
  });
});
