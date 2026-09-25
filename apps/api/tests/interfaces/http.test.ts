import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScanRun } from '../../src/domain/entities/measurement.js';
import type { ScanRunRepository } from '../../src/application/ports/repositories.js';
import type { ScanSnapshot, ScannerGateway } from '../../src/application/ports/scanner-gateway.js';
import { ClassifyDevice, GetDevice, ListDevices } from '../../src/application/use-cases/devices.js';
import { AcknowledgeEvent, ListEvents, ListOpenEvents, ReleaseEvent } from '../../src/application/use-cases/events.js';
import { GenerateWeeklyReport } from '../../src/application/use-cases/generate-weekly-report.js';
import { GetNetworkSummary } from '../../src/application/use-cases/get-network-summary.js';
import { IngestScanSnapshot } from '../../src/application/use-cases/ingest-scan-snapshot.js';
import {
  GetSettings,
  GetThroughputHistory,
  ListScanRuns,
  PurgeExpiredData,
  UpdateSettings,
} from '../../src/application/use-cases/maintenance.js';
import { RunScan } from '../../src/application/use-cases/run-scan.js';
import type { AppContainer } from '../../src/container.js';
import type { Env } from '../../src/infrastructure/config/env.js';
import { systemClock } from '../../src/infrastructure/system/index.js';
import { createServer } from '../../src/interfaces/http/server.js';
import {
  InMemoryDeviceRepository,
  InMemoryEventRepository,
  InMemoryPolicyRepository,
  InMemoryThroughputRepository,
  sequentialIds,
} from '../support/in-memory-repositories.js';

const PASSWORD = 'mot-de-passe-de-test';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'postgres://inutilise',
  SCANNER_MODE: 'demo',
  SCANNER_TIMEOUT_MS: 5_000,
  APP_PASSWORD: PASSWORD,
  SESSION_SECRET: 'secret-de-test-suffisamment-long-pour-passer',
  SESSION_TTL_HOURS: 1,
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
          latencyMs: 2,
          openPorts: [3389],
          certificates: [],
        },
      ],
      throughput: [],
    };
  }
}

class InMemoryScanRunRepository implements ScanRunRepository {
  readonly runs: ScanRun[] = [];

  async start(run: ScanRun): Promise<void> {
    this.runs.push(run);
  }

  async finish(run: ScanRun): Promise<void> {
    const index = this.runs.findIndex((item) => item.id === run.id);
    if (index >= 0) this.runs[index] = run;
  }

  async last(): Promise<ScanRun | null> {
    return this.runs.at(-1) ?? null;
  }

  async list(limit: number): Promise<ScanRun[]> {
    return [...this.runs].reverse().slice(0, limit);
  }
}

function buildTestContainer(): AppContainer {
  const devices = new InMemoryDeviceRepository();
  const events = new InMemoryEventRepository();
  const throughput = new InMemoryThroughputRepository();
  const policies = new InMemoryPolicyRepository();
  const scanRuns = new InMemoryScanRunRepository();
  const ids = sequentialIds();
  const ingest = new IngestScanSnapshot(devices, events, throughput, policies, ids);

  return {
    listDevices: new ListDevices(devices),
    getDevice: new GetDevice(devices),
    classifyDevice: new ClassifyDevice(devices, events, systemClock),
    listEvents: new ListEvents(events),
    listOpenEvents: new ListOpenEvents(events),
    acknowledgeEvent: new AcknowledgeEvent(events, systemClock),
    releaseEvent: new ReleaseEvent(events),
    getNetworkSummary: new GetNetworkSummary(devices, events, throughput, scanRuns, policies, systemClock),
    generateWeeklyReport: new GenerateWeeklyReport(devices, events, throughput, systemClock),
    getThroughputHistory: new GetThroughputHistory(throughput),
    listScanRuns: new ListScanRuns(scanRuns),
    getSettings: new GetSettings(policies),
    updateSettings: new UpdateSettings(policies),
    runScan: new RunScan(new StubScanner(), ingest, scanRuns, ids, systemClock, silentLogger),
    purgeExpiredData: new PurgeExpiredData(events, throughput, policies, systemClock, silentLogger),
  };
}

/** Parcours HTTP complet, sans PostgreSQL : routes, authentification et présentation. */
describe('API HTTP', () => {
  let baseUrl: string;
  let cookie = '';
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

  const get = (path: string) => fetch(`${baseUrl}${path}`, { headers: { cookie } });

  it('refuse l’accès sans session', async () => {
    const response = await fetch(`${baseUrl}/api/v1/summary`);
    expect(response.status).toBe(401);
  });

  it('refuse un mauvais mot de passe', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'incorrect' }),
    });
    expect(response.status).toBe(401);
  });

  it('ouvre une session avec le bon mot de passe', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    });

    expect(response.status).toBe(200);
    cookie = response.headers.getSetCookie().join('; ');
    expect(cookie).toContain('netwatch_session');
    await expect(response.json()).resolves.toMatchObject({ role: 'admin' });
  });

  it('découvre le parc au premier scan et le présente au format attendu', async () => {
    const scan = await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST', headers: { cookie } });
    expect(scan.status).toBe(202);
    await expect(scan.json()).resolves.toMatchObject({ status: 'succeeded', devicesSeen: 1 });

    const devices = (await (await get('/api/v1/devices')).json()) as Array<Record<string, unknown>>;
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      ip: '192.168.1.10',
      lifecycle: 'pending_classification',
      reachability: 'up',
    });

    const events = (await (await get('/api/v1/events')).json()) as Array<Record<string, unknown>>;
    // Machine inconnue (configuration) + port 3389 ouvert (signalement)
    expect(events.map((event) => event.category).sort()).toEqual(['configuration', 'signalement']);
  });

  it('classe une machine et referme l’événement d’ajout', async () => {
    const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string }>;
    const response = await fetch(`${baseUrl}/api/v1/devices/${devices[0]!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
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
      headers: { 'content-type': 'application/json', cookie },
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

    const taken = await fetch(url, { method: 'POST', headers: { cookie } });
    await expect(taken.json()).resolves.toMatchObject({ status: 'acknowledged' });

    const released = await fetch(url, { method: 'DELETE', headers: { cookie } });
    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toMatchObject({ status: 'open', acknowledgedAt: null });

    // Déjà ouvert : rien à retirer.
    const again = await fetch(url, { method: 'DELETE', headers: { cookie } });
    expect(again.status).toBe(400);
  });

  it('renvoie 404 pour un équipement inconnu', async () => {
    const response = await get('/api/v1/devices/inexistant');
    expect(response.status).toBe(404);
  });
});
