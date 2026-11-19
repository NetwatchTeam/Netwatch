/**
 * Injecte des photographies réseau fictives dans une API NetWatch en marche, sans collecteur.
 *
 *   npm run scan:inject -- <fichier.json | nom de scénario>... [options]
 *
 * Exemples (depuis la racine du dépôt) :
 *   npm run scan:inject -- 5-cas-limites-1-reference 5-cas-limites-2-inconnu-et-services-disparus
 *   npm run scan:inject -- 4-reseau-passerelles --scans 5        (scans 0 à 4 du scénario dynamique)
 *   npm run scan:inject -- ./mon-fichier.json --api http://localhost:3001 --keep-date
 *
 * Chaque photographie est d'abord validée **strictement** contre le contrat du collecteur
 * (un champ inconnu est une erreur), puis envoyée à `POST /api/v1/scans/import`, qui l'ingère
 * comme un vrai scan. Les scénarios sont cherchés dans tools/scanner-test/scenarios.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strictSnapshotSchema } from '../src/infrastructure/scanner/snapshot-schema.js';

const SCENARIOS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tools/scanner-test/scenarios');

interface Options {
  api: string;
  keepDate: boolean;
  scans: number;
  from: number;
  sources: string[];
}

const USAGE = `Usage : npm run scan:inject -- <fichier.json | scénario>... [--api URL] [--keep-date] [--scans N] [--from N]

  --api URL      API NetWatch (défaut : http://localhost:3001)
  --keep-date    garder le scannedAt du fichier (par défaut : remplacé par l'heure actuelle)
  --scans N      pour un scénario dynamique (.mjs) : nombre de scans à injecter (défaut : 1)
  --from N       pour un scénario dynamique : numéro du premier scan (défaut : 0)

Scénarios disponibles : tools/scanner-test/scenarios (sans l'extension).`;

function parseArgs(argv: string[]): Options {
  const options: Options = { api: 'http://localhost:3001', keepDate: false, scans: 1, from: 0, sources: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--api') options.api = argv[++i] ?? options.api;
    else if (arg === '--keep-date') options.keepDate = true;
    else if (arg === '--scans') options.scans = Math.max(1, Number(argv[++i]) || 1);
    else if (arg === '--from') options.from = Math.max(0, Number(argv[++i]) || 0);
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else options.sources.push(arg);
  }
  return options;
}

/** Un chemin existant, ou le nom d'un scénario du faux collecteur (avec ou sans extension). */
function locate(source: string): string {
  const candidates = [
    resolve(process.env.INIT_CWD ?? process.cwd(), source),
    join(SCENARIOS_DIR, source),
    join(SCENARIOS_DIR, `${source}.json`),
    join(SCENARIOS_DIR, `${source}.mjs`),
  ];
  const found = candidates.find((path) => existsSync(path) && /\.(json|mjs)$/.test(path));
  if (!found) throw new Error(`« ${source} » introuvable (ni fichier, ni scénario de ${SCENARIOS_DIR})`);
  return found;
}

/** Les photographies à injecter pour une source, dans l'ordre. */
async function payloadsOf(path: string, options: Options): Promise<Array<{ label: string; payload: unknown }>> {
  if (path.endsWith('.json')) {
    return [{ label: basename(path), payload: JSON.parse(await readFile(path, 'utf8')) as unknown }];
  }
  const scenario = (await import(pathToFileURL(path).href)) as {
    default: (input: { scanNumber: number; now: Date }) => unknown;
    phase?: (scanNumber: number) => string;
  };
  return Array.from({ length: options.scans }, (_, index) => {
    const scanNumber = options.from + index;
    const phase = scenario.phase?.(scanNumber);
    return {
      label: `${basename(path)} scan ${scanNumber}${phase ? ` (${phase})` : ''}`,
      payload: scenario.default({ scanNumber, now: new Date() }),
    };
  });
}

/** Code de sortie : 0 si tout a été injecté, 1 sinon. */
async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.sources.length === 0) {
    console.error(USAGE);
    return 1;
  }

  const endpoint = `${options.api.replace(/\/$/, '')}/api/v1/scans/import`;
  let failures = 0;

  for (const source of options.sources) {
    let path: string;
    try {
      path = locate(source);
    } catch (error) {
      console.error(`✗ ${(error as Error).message}`);
      failures += 1;
      continue;
    }

    for (const { label, payload } of await payloadsOf(path, options)) {
      const checked = strictSnapshotSchema.safeParse(payload);
      if (!checked.success) {
        failures += 1;
        console.error(`✗ ${label} : non conforme au contrat du collecteur`);
        for (const issue of checked.error.issues.slice(0, 10)) {
          console.error(`    ${issue.path.join('.') || '(racine)'} : ${issue.message}`);
        }
        continue;
      }

      const body = options.keepDate
        ? (payload as Record<string, unknown>)
        : { ...(payload as Record<string, unknown>), scannedAt: new Date().toISOString() };

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        console.error(`✗ API injoignable (${endpoint}) : est-elle démarrée ? (npm run dev:demo, ou --api)`);
        return 1;
      }

      const result = (await response.json().catch(() => null)) as
        | { status?: string; devicesSeen?: number; eventsRaised?: number; error?: unknown }
        | null;
      if (!response.ok) {
        failures += 1;
        console.error(`✗ ${label} : HTTP ${response.status} — ${JSON.stringify(result?.error ?? result)}`);
        if (response.status === 403) return 1;
        continue;
      }
      if (result?.status !== 'succeeded') failures += 1;
      console.log(
        `${result?.status === 'succeeded' ? '✓' : '✗'} ${label} : ${result?.devicesSeen ?? 0} équipement(s) vus, ` +
          `${result?.eventsRaised ?? 0} événement(s) ouvert(s)${result?.status === 'succeeded' ? '' : ` — ${String(result?.error)}`}`,
      );
    }
  }

  return failures > 0 ? 1 : 0;
}

// `process.exitCode` plutôt que `process.exit()` : sous Windows, quitter pendant que les connexions
// de `fetch` se ferment fait planter Node (« Assertion failed … UV_HANDLE_CLOSING »).
process.exitCode = await main();
