import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScanRequest, ScanSnapshot, ScannerGateway } from '../../src/application/ports/scanner-gateway.js';
import type { DeviceObservation } from '../../src/domain/entities/device.js';
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
  /** Machines supplémentaires que les tests font apparaître sur le réseau. */
  readonly extra: DeviceObservation[] = [];
  lastRequest: ScanRequest | undefined;

  async fetchSnapshot(request?: ScanRequest): Promise<ScanSnapshot> {
    this.lastRequest = request;
    return {
      scannedAt: new Date(),
      devices: [
        ...this.extra,
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

const scanner = new StubScanner();

function buildTestContainer(): AppContainer {
  return buildUseCases(inMemoryRepositories(), {
    scanner,
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
    // Machine à valider : seul l'événement d'ajout est ouvert. Le port 3389 exposé ne sera
    // signalé qu'une fois la machine validée : elle n'est pas encore supervisée.
    expect(events.map((event) => event.category)).toEqual(['configuration']);
  });

  it('classe une machine et referme l’événement d’ajout', async () => {
    const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string }>;
    const response = await fetch(`${baseUrl}/api/v1/devices/${devices[0]!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'server', label: 'Serveur ERP', critical: true, author: 'Amir' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ kind: 'server', lifecycle: 'active' });
    expect((await (await get('/api/v1/events?status=open')).json()) as unknown[]).toEqual([]);

    // Validée, elle est supervisée dès le scan suivant : le port exposé est signalé.
    await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST' });
    const open = (await (await get('/api/v1/events?status=open')).json()) as Array<{ category: string }>;
    expect(open.map((event) => event.category)).toEqual(['signalement']);

    const detail = (await (await get(`/api/v1/devices/${devices[0]!.id}`)).json()) as { decisions: unknown[] };
    expect(detail.decisions).toEqual([
      expect.objectContaining({
        action: 'validated',
        author: 'Amir',
        previousLifecycle: 'pending_classification',
        lifecycle: 'active',
      }),
    ]);
  });

  it('refuse une décision sans auteur : chaque action doit être tracée', async () => {
    const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string }>;
    const response = await fetch(`${baseUrl}/api/v1/devices/${devices[0]!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'server', lifecycle: 'ignored' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { details: Array<{ path: string }> } };
    expect(body.error.details.map((detail) => detail.path)).toEqual(['author']);
  });

  it('rejette une classification invalide', async () => {
    const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string }>;
    const response = await fetch(`${baseUrl}/api/v1/devices/${devices[0]!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'grille-pain', author: 'Amir' }),
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

  describe('ajout manuel d’un équipement', () => {
    const post = (body: unknown) =>
      fetch(`${baseUrl}/api/v1/devices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('valide les champs obligatoires côté API', async () => {
      const response = await post({ ip: '999.1.1.1', label: '  ', kind: 'unknown', mac: 'pas-une-mac' });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { details: Array<{ path: string }> } };
      expect(body.error.details.map((detail) => detail.path).sort()).toEqual([
        'author',
        'critical',
        'ip',
        'kind',
        'label',
        'mac',
      ]);
    });

    it('détecte un doublon avec un équipement connu et le désigne', async () => {
      const response = await post({ ip: '192.168.1.10', label: 'ERP', kind: 'server', critical: true, author: 'Amir' });

      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: { code: string; details: unknown } };
      expect(body.error.code).toBe('duplicate_device');
      expect(body.error.details).toMatchObject({
        existing: { ip: '192.168.1.10', name: 'Serveur ERP', lifecycle: 'active', origin: 'discovered' },
        matchedOn: ['ip'],
      });
    });

    it('crée l’équipement dans le référentiel et le fait superviser comme les autres', async () => {
      const response = await post({
        ip: '192.168.1.50',
        label: 'Automate de production',
        kind: 'iot',
        critical: true,
        author: 'Amir',
      });

      expect(response.status).toBe(201);
      const created = (await response.json()) as { id: string };
      expect(created).toMatchObject({
        origin: 'manual',
        lifecycle: 'active',
        reachability: 'unknown',
        lastSeenAt: null,
        critical: true,
      });

      // Le collecteur reçoit son IP à sonder ; muet, il passe en panne comme n'importe quel équipement suivi.
      await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST' });
      expect(scanner.lastRequest?.targets).toEqual(['192.168.1.50']);

      const detail = (await (await get(`/api/v1/devices/${created.id}`)).json()) as {
        device: { reachability: string };
        events: Array<{ type: string }>;
        decisions: Array<{ action: string; author: string }>;
      };
      expect(detail.device.reachability).toBe('down');
      expect(detail.events.map((event) => event.type)).toEqual(['device_unreachable']);
      expect(detail.decisions).toEqual([expect.objectContaining({ action: 'created', author: 'Amir' })]);

      // Dès qu'il répond, il est reconnu par son IP : pas de doublon « découvert ».
      scanner.extra.push(observationOf('192.168.1.50', 'aa:bb:cc:dd:ee:50'));
      await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST' });
      const all = (await (await get('/api/v1/devices')).json()) as Array<{ ip: string }>;
      expect(all.filter((device) => device.ip === '192.168.1.50')).toEqual([
        expect.objectContaining({ reachability: 'up', mac: 'aa:bb:cc:dd:ee:50', origin: 'manual' }),
      ]);
    });

    it('fusionne avec un équipement découvert au lieu de créer un doublon', async () => {
      scanner.extra.push(observationOf('192.168.1.60', 'aa:bb:cc:dd:ee:60'));
      await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST' });

      // Même carte réseau, autre IP saisie : la MAC suffit à reconnaître l'équipement.
      const input = {
        ip: '192.168.1.61',
        mac: 'AA-BB-CC-DD-EE-60',
        label: 'Imprimante accueil',
        kind: 'printer',
        critical: false,
        author: 'Amir',
      };
      const conflict = await post(input);
      expect(conflict.status).toBe(409);
      const { error } = (await conflict.json()) as {
        error: { details: { existing: { id: string; lifecycle: string }; matchedOn: string[] } };
      };
      expect(error.details.existing.lifecycle).toBe('pending_classification');
      expect(error.details.matchedOn).toEqual(['mac']);

      const merged = await post({ ...input, mergeInto: error.details.existing.id });
      expect(merged.status).toBe(200);
      await expect(merged.json()).resolves.toMatchObject({
        id: error.details.existing.id,
        ip: '192.168.1.60',
        label: 'Imprimante accueil',
        kind: 'printer',
        lifecycle: 'active',
        origin: 'discovered',
      });

      const open = (await (await get('/api/v1/events?status=open')).json()) as Array<{ deviceId: string }>;
      expect(open.filter((event) => event.deviceId === error.details.existing.id)).toEqual([]);
    });

    it('refuse de fusionner avec un équipement qui n’a ni cette IP ni cette MAC', async () => {
      const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string; ip: string }>;
      const erp = devices.find((device) => device.ip === '192.168.1.10')!;
      const response = await post({
        ip: '192.168.1.99',
        label: 'Autre',
        kind: 'server',
        critical: false,
        author: 'Amir',
        mergeInto: erp.id,
      });
      expect(response.status).toBe(400);
    });

    it('exclut un équipement et garde la trace de la décision', async () => {
      const devices = (await (await get('/api/v1/devices')).json()) as Array<{ id: string; ip: string }>;
      const printer = devices.find((device) => device.ip === '192.168.1.60')!;
      const response = await fetch(`${baseUrl}/api/v1/devices/${printer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'printer', lifecycle: 'excluded', author: 'Léa' }),
      });
      await expect(response.json()).resolves.toMatchObject({ lifecycle: 'excluded' });

      const detail = (await (await get(`/api/v1/devices/${printer.id}`)).json()) as {
        decisions: Array<{ action: string; author: string }>;
      };
      expect(detail.decisions.map((decision) => `${decision.action}:${decision.author}`)).toEqual([
        'excluded:Léa',
        'merged:Amir',
      ]);
    });
  });
  describe('tout valider', () => {
    it('exige un auteur, puis valide chaque machine en attente en traçant une décision par machine', async () => {
      scanner.extra.push(observationOf('192.168.1.70', 'aa:bb:cc:dd:ee:70'), observationOf('192.168.1.71', 'aa:bb:cc:dd:ee:71'));
      await fetch(`${baseUrl}/api/v1/scans/run`, { method: 'POST' });
      const pending = (await (await get('/api/v1/devices?lifecycle=pending_classification')).json()) as Array<{ id: string }>;
      expect(pending).toHaveLength(2);

      const call = (body: unknown) =>
        fetch(`${baseUrl}/api/v1/devices/validate-pending`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

      expect((await call({})).status).toBe(400);

      const response = await call({ author: 'Léa' });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ validated: 2 });
      expect((await (await get('/api/v1/devices?lifecycle=pending_classification')).json()) as unknown[]).toEqual([]);

      const detail = (await (await get(`/api/v1/devices/${pending[0]!.id}`)).json()) as {
        device: { lifecycle: string };
        decisions: Array<{ action: string; author: string }>;
      };
      expect(detail.device.lifecycle).toBe('active');
      expect(detail.decisions).toEqual([expect.objectContaining({ action: 'validated', author: 'Léa' })]);
    });
  });

  describe('injection d’un jeu de données fictif', () => {
    const importScan = (body: unknown, url = baseUrl) =>
      fetch(`${url}/api/v1/scans/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const scenario = async (name: string) =>
      JSON.parse(
        await readFile(join(dirname(fileURLToPath(import.meta.url)), '../../../../tools/scanner-test/scenarios', name), 'utf8'),
      ) as { devices: Array<Record<string, unknown>> };

    it('ingère une photographie conforme comme un vrai scan', async () => {
      const response = await importScan({
        ...(await scenario('5-cas-limites-1-reference.json')),
        scannedAt: new Date().toISOString(),
      });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ status: 'succeeded', devicesSeen: 4 });
      const devices = (await (await get('/api/v1/devices?q=192.168.20')).json()) as unknown[];
      expect(devices).toHaveLength(4);
      const runs = (await (await get('/api/v1/scans')).json()) as Array<{ devicesSeen: number }>;
      expect(runs[0]?.devicesSeen).toBe(4);
    });

    it('refuse une photographie qui ne respecte pas strictement le contrat', async () => {
      const payload = await scenario('5-cas-limites-1-reference.json');
      const response = await importScan({ ...payload, devices: [{ ...payload.devices[0], hostName: 'faute' }] });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { details: Array<{ path: string; message: string }> } };
      expect(body.error.details[0]?.path).toBe('devices.0');
      expect(body.error.details[0]?.message).toContain('hostName');
    });

    it('est désactivée en production, sauf SCAN_IMPORT=enabled', async () => {
      const app = createServer(buildTestContainer(), { ...env, NODE_ENV: 'production' }, silentLogger);
      const production = app.listen(0);
      await new Promise((resolve) => production.once('listening', resolve));
      try {
        const url = `http://127.0.0.1:${(production.address() as AddressInfo).port}`;
        const response = await importScan(await scenario('5-cas-limites-1-reference.json'), url);
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({ error: { code: 'forbidden' } });
      } finally {
        production.close();
      }
    });
  });

  it('sert le dashboard compilé sur ses propres adresses, même avec un WEB_DIST_PATH relatif', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'netwatch-web-'));
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>NetWatch</title>');
    const app = createServer(buildTestContainer(), { ...env, WEB_DIST_PATH: relative(process.cwd(), dist) }, silentLogger);
    const web = app.listen(0);
    await new Promise((resolve) => web.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
      const page = await fetch(`${url}/technique/a-identifier`);
      expect(page.status).toBe(200);
      await expect(page.text()).resolves.toContain('NetWatch');
      expect((await fetch(`${url}/api/v1/inexistant`)).status).toBe(404);
    } finally {
      web.close();
      await rm(dist, { recursive: true, force: true });
    }
  });
});

function observationOf(ip: string, mac: string): DeviceObservation {
  return {
    ip,
    mac,
    hostname: null,
    vendor: null,
    gatewayIp: null,
    latencyMs: 3,
    packetLossPercent: 0,
    cpuPercent: null,
    memory: null,
    disks: [],
    ports: [],
    certificates: [],
  };
}
