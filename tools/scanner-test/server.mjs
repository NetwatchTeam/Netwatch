// Faux scanner pour tester NetWatch sans réseau réel.
// Il répond à GET /scan avec le fichier JSON du scénario actif, relu à chaque appel :
// on peut donc modifier le fichier et relancer un scan depuis l'interface.
//
//   GET /scan              → contenu du scénario actif (scannedAt remplacé par l'heure actuelle)
//   GET /                  → liste des scénarios et scénario actif
//   GET /use/<nom>         → change de scénario (nom du fichier sans .json)

import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8080);
const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');
let active = process.env.SCENARIO ?? '1-reseau-normal';

async function listScenarios() {
  const files = await readdir(SCENARIOS_DIR);
  return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)).sort();
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (url.pathname === '/scan') {
      const raw = await readFile(join(SCENARIOS_DIR, `${active}.json`), 'utf8');
      const snapshot = JSON.parse(raw);
      // Chaque scan doit être daté du moment où il a lieu, sinon l'historique n'avance pas.
      snapshot.scannedAt = new Date().toISOString();
      console.log(`[scan] scénario « ${active} » — ${snapshot.devices?.length ?? 0} équipement(s)`);
      return send(res, 200, snapshot);
    }

    if (url.pathname.startsWith('/use/')) {
      const name = decodeURIComponent(url.pathname.slice('/use/'.length));
      const scenarios = await listScenarios();
      if (!scenarios.includes(name)) return send(res, 404, { error: `Scénario inconnu : ${name}`, scenarios });
      active = name;
      console.log(`[use] scénario actif : ${active}`);
      return send(res, 200, { active });
    }

    if (url.pathname === '/') {
      return send(res, 200, { active, scenarios: await listScenarios() });
    }

    send(res, 404, { error: 'Route inconnue' });
  } catch (error) {
    // Un JSON mal formé dans un scénario doit se voir dans la page « Scans » de NetWatch.
    console.error(`[erreur] ${error.message}`);
    send(res, 500, { error: error.message });
  }
}).listen(PORT, () => {
  console.log(`Faux scanner sur :${PORT} — scénario actif : ${active}`);
});
