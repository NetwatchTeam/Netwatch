// Faux scanner pour tester NetWatch sans réseau réel.
//
//   GET /scan                   → photographie du réseau selon le scénario actif
//   GET /                       → scénarios disponibles, scénario actif, numéro du prochain scan et sa phase
//   GET /use/<nom>              → change de scénario et repart du scan 0
//   GET /use/<nom>?scan=<n>     → change de scénario et saute directement au scan n
//
// Deux sortes de scénarios dans scenarios/ :
//   <nom>.json  photographie fixe, relue à chaque appel (scannedAt remplacé par l'heure actuelle) ;
//   <nom>.mjs   module dont `default({ scanNumber, now })` renvoie la photographie : le réseau
//               évolue d'un scan à l'autre (pannes régulières). `phase(n)`, facultatif, nomme l'étape.
// Les deux sont relus à chaque scan : on peut les modifier sans redémarrer.

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT ?? 8080);
const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');

let active = process.env.SCENARIO ?? '4-reseau-passerelles';
/** Numéro du prochain scan dans le scénario actif. */
let scanNumber = 0;

async function listScenarios() {
  const files = await readdir(SCENARIOS_DIR);
  return files
    .filter((file) => file.endsWith('.json') || file.endsWith('.mjs'))
    .map((file) => file.replace(/\.(json|mjs)$/, ''))
    .sort();
}

/** Module rechargé quand le fichier change, sans redémarrer le serveur. */
async function loadModule(name) {
  const path = join(SCENARIOS_DIR, `${name}.mjs`);
  const { mtimeMs } = await stat(path);
  return import(`${pathToFileURL(path).href}?v=${mtimeMs}`);
}

async function isDynamic(name) {
  return stat(join(SCENARIOS_DIR, `${name}.mjs`)).then(() => true, () => false);
}

async function describe(name, n) {
  if (!(await isDynamic(name))) return { type: 'fixe' };
  const module = await loadModule(name);
  return { type: 'dynamique', nextScan: n, nextPhase: module.phase?.(n) ?? null, cycleLength: module.CYCLE_LENGTH ?? null };
}

async function snapshot(name, n) {
  const now = new Date();
  if (await isDynamic(name)) {
    const module = await loadModule(name);
    return { body: module.default({ scanNumber: n, now }), phase: module.phase?.(n) ?? null };
  }
  const body = JSON.parse(await readFile(join(SCENARIOS_DIR, `${name}.json`), 'utf8'));
  // Chaque scan doit être daté du moment où il a lieu, sinon l'historique n'avance pas.
  body.scannedAt = now.toISOString();
  return { body, phase: null };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (url.pathname === '/scan') {
      const n = scanNumber;
      const { body, phase } = await snapshot(active, n);
      scanNumber += 1;
      const label = phase ? ` — scan ${n}, phase « ${phase} »` : '';
      console.log(`[scan] scénario « ${active} »${label} — ${body.devices?.length ?? 0} équipement(s)`);
      return send(res, 200, body);
    }

    if (url.pathname.startsWith('/use/')) {
      const name = decodeURIComponent(url.pathname.slice('/use/'.length));
      const scenarios = await listScenarios();
      if (!scenarios.includes(name)) return send(res, 404, { error: `Scénario inconnu : ${name}`, scenarios });
      active = name;
      scanNumber = Math.max(0, Number.parseInt(url.searchParams.get('scan') ?? '0', 10) || 0);
      console.log(`[use] scénario actif : ${active} (prochain scan : ${scanNumber})`);
      return send(res, 200, { active, ...(await describe(active, scanNumber)) });
    }

    if (url.pathname === '/') {
      return send(res, 200, { active, ...(await describe(active, scanNumber)), scenarios: await listScenarios() });
    }

    send(res, 404, { error: 'Route inconnue' });
  } catch (error) {
    // Un scénario mal formé doit se voir dans la page « Scans » de NetWatch.
    console.error(`[erreur] ${error.message}`);
    send(res, 500, { error: error.message });
  }
}).listen(PORT, () => {
  console.log(`Faux scanner sur :${PORT} — scénario actif : ${active}`);
});
