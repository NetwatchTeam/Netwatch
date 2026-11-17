import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ScannerGateway } from '../src/application/ports/scanner-gateway.js';
import { buildUseCases } from '../src/container.js';
import type { Env } from '../src/infrastructure/config/env.js';
import { inMemoryRepositories, sequentialUuids } from '../src/infrastructure/persistence/memory/in-memory-repositories.js';
import { snapshotSchema, toDomainSnapshot } from '../src/infrastructure/scanner/snapshot-schema.js';
import { createServer } from '../src/interfaces/http/server.js';

/**
 * Exemples JSON du contrat, produits par le vrai code : l'API tourne (stockage en mémoire)
 * sur le réseau de test tools/scanner-test/scenarios/4-reseau-passerelles.mjs, jusqu'à la panne
 * de la passerelle gw-atelier, puis chaque route est appelée en HTTP.
 *
 * Écrits dans docs/examples/ par `npm run contract:examples -w @netwatch/api` ;
 * tests/contract/examples.test.ts vérifie qu'ils restent conformes au code.
 */

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const EXAMPLES_DIR = join(REPO_ROOT, 'docs/examples');

interface Scenario {
  default: (input: { scanNumber: number; now: Date }) => Record<string, unknown> & { devices: Array<{ hostname?: string }> };
}

export interface ContractExamples {
  /** Chemin relatif à docs/examples → contenu JSON. */
  files: Map<string, unknown>;
}

const SCAN_INTERVAL_MS = 5 * 60_000;

export async function generateContractExamples(): Promise<ContractExamples> {
  const scenarioPath = join(REPO_ROOT, 'tools/scanner-test/scenarios/4-reseau-passerelles.mjs');
  const scenario = (await import(pathToFileURL(scenarioPath).href)) as Scenario;

  // Horloge réelle décalée : le dernier scan a lieu « maintenant », les dates sont cohérentes entre elles.
  let now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 3 * SCAN_INTERVAL_MS);
  const clock = { now: () => now };
  let scanNumber = 0;
  let lastCollectorPayload: Record<string, unknown> | null = null;

  // Le collecteur simulé passe par la validation du contrat, comme un vrai collecteur.
  const scanner: ScannerGateway = {
    async fetchSnapshot() {
      const payload = { contractVersion: '1.0.0', ...scenario.default({ scanNumber, now }) };
      scanNumber += 1;
      lastCollectorPayload = payload;
      return toDomainSnapshot(snapshotSchema.parse(payload));
    },
  };

  const silent = { info: () => {}, warn: () => {}, error: () => {} };
  const container = buildUseCases(inMemoryRepositories(), { scanner, clock, ids: sequentialUuids(), logger: silent });
  const env: Env = {
    NODE_ENV: 'test',
    PORT: 0,
    STORAGE: 'memory',
    SCANNER_MODE: 'demo',
    SCANNER_TIMEOUT_MS: 15_000,
    REPORT_TIME_ZONE: 'Europe/Paris',
  };
  const server = createServer(container, env, silent).listen(0);
  await new Promise((done) => server.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  const files = new Map<string, unknown>();
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const get = async (path: string) => (await call(path)).body;
  const scan = async () => {
    await call('/scans/run', 'POST');
    now = new Date(now.getTime() + SCAN_INTERVAL_MS);
  };
  const idOf = async (hostname: string) =>
    ((await get(`/devices?q=${hostname}`)) as Array<{ id: string; hostname: string }>).find((d) => d.hostname === hostname)!.id;

  try {
    // Scans 0 à 2 : réseau normal. Un technicien identifie quelques équipements et valide le graphe.
    await scan();
    await scan();
    const gatewayId = await idOf('gw-atelier');
    await call(`/devices/${gatewayId}`, 'PATCH', { kind: 'router', label: 'Passerelle atelier', critical: true });
    await call(`/devices/${await idOf('srv-erp')}`, 'PATCH', { kind: 'server', label: 'Serveur ERP', critical: true });
    await call(`/devices/${await idOf('cam-quai')}`, 'PATCH', { kind: 'camera', label: 'Caméra quai de chargement' });
    files.set('api/dependencies-validate-suggestions.response.json', (await call('/dependencies/validate-suggestions', 'POST')).body);
    await scan();

    // Scan 3 : la passerelle de l'atelier tombe. Le technicien prend l'incident en charge.
    await scan();
    const incidents = (await get('/events?category=incident&status=open')) as Array<{ id: string; deviceId: string }>;
    const gatewayIncident = incidents.find((event) => event.deviceId === gatewayId)!;
    files.set('api/event-acknowledge.response.json', (await call(`/events/${gatewayIncident.id}/acknowledge`, 'POST')).body);

    const pcId = await idOf('pc-atelier-01');
    files.set('api/health.response.json', await (await fetch(base.replace('/api/v1', '/healthz'))).json());
    files.set('api/summary.response.json', await get('/summary'));
    files.set('api/devices.response.json', await get('/devices?q=srv'));
    files.set('api/device-gateway-down.response.json', await get(`/devices/${gatewayId}`));
    files.set('api/device-unreachable.response.json', await get(`/devices/${pcId}`));
    files.set('api/events-incidents.response.json', await get('/events?category=incident&limit=5'));
    files.set('api/events-anomalies.response.json', await get('/events?category=observation&status=open'));
    files.set('api/events-security.response.json', await get('/events?category=signalement&status=open&limit=4'));
    files.set('api/dependencies.response.json', await get(`/dependencies?deviceId=${gatewayId}`));
    files.set('api/throughput.response.json', await get(`/metrics/throughput?deviceId=${gatewayId}`));
    files.set('api/scans.response.json', await get('/scans'));
    files.set('api/settings.response.json', await get('/settings'));
    files.set('api/weekly-report.response.json', await get('/reports/weekly'));

    // Corps de requête et erreurs.
    files.set('api/device-classify.request.json', { kind: 'router', label: 'Passerelle atelier', critical: true });
    files.set('api/dependency-create.request.json', { deviceId: pcId, dependsOnId: gatewayId });
    files.set('api/dependency-update.request.json', { status: 'validated' });
    files.set('api/settings-update.request.json', { cpuWarningPercent: 85, packetLossWarningPercent: 3 });
    files.set('api/error-400-validation.response.json', (await call('/settings', 'PUT', { cpuWarningPercent: 140 })).body);
    files.set('api/error-404.response.json', (await call('/devices/inconnu')).body);
    files.set(
      'api/error-409-cycle.response.json',
      (await call('/dependencies', 'POST', { deviceId: gatewayId, dependsOnId: pcId })).body,
    );

    // Réponse du collecteur : un extrait réel de la photographie du scan 3 (une machine de chaque sorte).
    const keep = new Set(['srv-erp', 'cam-quai', 'gw-commercial', 'pc-commercial-07', 'pc-compta-03']);
    const collector = lastCollectorPayload as unknown as { devices: Array<{ hostname?: string }>; throughput: unknown[] };
    files.set('collecteur/scan.response.json', {
      ...collector,
      devices: collector.devices.filter((device) => keep.has(device.hostname ?? '')),
      throughput: collector.throughput.slice(0, 2),
    });
  } finally {
    server.close();
  }

  return { files };
}
