import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScanSnapshot, ScannerGateway } from '../../src/application/ports/scanner-gateway.js';
import { buildUseCases, type AppContainer } from '../../src/container.js';
import type { Env } from '../../src/infrastructure/config/env.js';
import { systemClock } from '../../src/infrastructure/system/index.js';
import { createServer } from '../../src/interfaces/http/server.js';
import { inMemoryRepositories, sequentialIds } from '../support/in-memory-repositories.js';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  STORAGE: 'postgres',
  DATABASE_URL: 'postgres://inutilise',
  SCANNER_MODE: 'demo',
  SCANNER_TIMEOUT_MS: 5_000,
  REPORT_TIME_ZONE: 'Europe/Paris',
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

class StubScanner implements ScannerGateway {
  async fetchSnapshot(): Promise<ScanSnapshot> {
    return {
      scannedAt: new Date(),
      devices: [
        {
          ip: '192.168.1.10',
          mac: 'aa:bb:cc:dd:ee:10',
          hostname: 'srv-erp',
          vendor: 'Dell',
          gatewayIp: null,
          latencyMs: 2,
          packetLossPercent: 0,
          cpuPercent: 35,
          memory: { usedPercent: 62, totalMb: 16_384 },
          disks: [{ name: 'C:', usedPercent: 71, totalGb: 476 }],
          ports: [
            { port: 443, protocol: 'tcp', services: [{ name: 'https', product: 'nginx', version: '1.24' }] },
            { port: 3389, protocol: 'tcp', services: [{ name: 'ms-wbt-server', product: null, version: null }] },
          ],
          certificates: [
            {
              port: 443,
              subject: 'CN=srv-erp.local',
              issuer: 'CN=AC interne',
              validFrom: new Date(Date.now() - 30 * 86_400_000),
              expiresAt: new Date(Date.now() + 300 * 86_400_000),
              valid: true,
              validationError: null,
            },
          ],
        },
      ],
      throughput: [],
    };
  }
}

function buildTestContainer(): AppContainer {
  return buildUseCases(inMemoryRepositories(), {
    scanner: new StubScanner(),
    clock: systemClock,
    ids: sequentialIds(),
    logger: silentLogger,
  });
}

/** Parcours HTTP complet, sans PostgreSQL : routes et présentation. */
describe('API HTTP', () => {
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createServer>['listen']>;

  beforeAll(async () => {
    const app = createServer(buildTestContainer(), env, silentLogger);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const get = (path: string) => fetch(`${baseUrl}${path}`);

  it('donne accès au tableau de bord sans connexion', async () => {
    const response = await get('/api/v1/summary');
    expect(response.status).toBe(200);
  });

  it('ne propose plus de route de connexion', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  it('découvre le parc au premier scan et le présente au format attendu', async () => {
    const scan = await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST' });
    expect(scan.status).toBe(202);
    await expect(scan.json()).resolves.toMatchObject({ status: 'succeeded', devicesSeen: 1 });

    const devices = (await (await get('/api/v1/devices')).json()) as Array<Record<string, unknown>>;
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      ip: '192.168.1.10',
      lifecycle: 'pending_classification',
      reachability: 'up',
      packetLossPercent: 0,
      cpuPercent: 35,
      memory: { usedPercent: 62, totalMb: 16_384 },
      disks: [{ name: 'C:', usedPercent: 71, totalGb: 476 }],
      ports: [
        { port: 443, protocol: 'tcp', services: [{ name: 'https', product: 'nginx', version: '1.24' }] },
        { port: 3389, protocol: 'tcp', services: [{ name: 'ms-wbt-server', product: null, version: null }] },
      ],
    });
    expect(devices[0]!.certificates).toEqual([
      expect.objectContaining({ port: 443, valid: true, validationError: null, status: 'valid' }),
    ]);

    const events = (await (await get('/api/v1/events')).json()) as Array<Record<string, unknown>>;
    // Machine inconnue (configuration) + port 3389 ouvert (signalement)
    expect(events.map((event) => event.category).sort()).toEqual(['configuration', 'signalement']);
  });

  it('classe une machine et referme l’événement d’ajout', async () => {
    const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string }>;
    const response = await fetch(`${baseUrl}/api/v1/devices/${devices[0]!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'server', label: 'Serveur ERP', critical: true }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ kind: 'server', lifecycle: 'active' });

    const open = (await (await get('/api/v1/events?status=open')).json()) as Array<{ category: string }>;
    expect(open.map((event) => event.category)).toEqual(['signalement']);
  });

  it('rejette une classification invalide', async () => {
    const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string }>;
    const response = await fetch(`${baseUrl}/api/v1/devices/${devices[0]!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'grille-pain' }),
    });

    expect(response.status).toBe(400);
  });

  it('renvoie une synthèse et un rapport hebdomadaire cohérents', async () => {
    const summary = (await (await get('/api/v1/summary')).json()) as Record<string, unknown>;
    expect(summary).toMatchObject({ devices: { total: 1, up: 1 }, scannerStale: false });

    const report = (await (await get('/api/v1/reports/weekly')).json()) as Record<string, unknown>;
    expect(report.devicesMonitored).toBe(1);
    expect(String(report.headline)).toContain('Aucune panne');
  });

  it('prend en charge un événement puis retire la prise en charge', async () => {
    const [event] = (await (await get('/api/v1/events?status=open')).json()) as Array<{ id: string }>;
    const url = `${baseUrl}/api/v1/events/${event!.id}/acknowledge`;

    const taken = await fetch(url, { method: 'POST' });
    await expect(taken.json()).resolves.toMatchObject({ status: 'acknowledged' });

    const released = await fetch(url, { method: 'DELETE' });
    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toMatchObject({ status: 'open', acknowledgedAt: null });

    // Déjà ouvert : rien à retirer.
    const again = await fetch(url, { method: 'DELETE' });
    expect(again.status).toBe(400);
  });

  it('exporte le rapport hebdomadaire en PDF', async () => {
    const response = await get('/api/v1/reports/weekly.pdf');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="netwatch-rapport-hebdomadaire-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rejette une semaine invalide pour l’export PDF', async () => {
    const response = await get('/api/v1/reports/weekly.pdf?week=pas-une-date');
    expect(response.status).toBe(400);
  });

  it('renvoie 404 pour un équipement inconnu', async () => {
    const response = await get('/api/v1/devices/inexistant');
    expect(response.status).toBe(404);
  });
});
