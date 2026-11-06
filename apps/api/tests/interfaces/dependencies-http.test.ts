import type { AddressInfo } from 'node:net';
import type { DependencyDto, DependencyGraphDto } from '@netwatch/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScanSnapshot, ScannerGateway } from '../../src/application/ports/scanner-gateway.js';
import { buildUseCases } from '../../src/container.js';
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

/** Une passerelle et deux PC derrière elle. */
class GatewayScanner implements ScannerGateway {
  async fetchSnapshot(): Promise<ScanSnapshot> {
    const host = (ip: string, hostname: string, gatewayIp: string | null) => ({
      ip, mac: null, hostname, vendor: null, gatewayIp, latencyMs: 1, packetLossPercent: 0,
      cpuPercent: null, memory: null, disks: [], ports: [], certificates: [],
    });
    return {
      scannedAt: new Date(),
      devices: [
        host('10.0.0.1', 'gw-atelier', null),
        host('10.0.1.1', 'pc-atelier-01', '10.0.0.1'),
        host('10.0.1.2', 'pc-atelier-02', '10.0.0.1'),
      ],
      throughput: [],
    };
  }
}

describe('API HTTP — dépendances', () => {
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createServer>['listen']>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const silent = { info: () => {}, warn: () => {}, error: () => {} };
    const container = buildUseCases(inMemoryRepositories(), {
      scanner: new GatewayScanner(),
      clock: systemClock,
      ids: sequentialIds(),
      logger: silent,
    });
    server = createServer(container, env, silent).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

    await fetch(`${baseUrl}/scans/run`, { method: 'POST' });
    for (const d of (await (await fetch(`${baseUrl}/devices`)).json()) as Array<{ id: string; hostname: string }>) {
      ids[d.hostname] = d.id;
    }
  });

  afterAll(() => {
    server.close();
  });

  const call = (path: string, method = 'GET', body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

  it('liste les passerelles vues par le collecteur comme des suggestions, non utilisées par la corrélation', async () => {
    const graph = (await (await call('/dependencies')).json()) as DependencyGraphDto;

    expect(graph.counts).toEqual({ suggested: 2, validated: 0, rejected: 0 });
    expect(graph.dependencies[0]).toMatchObject({
      source: 'discovered',
      status: 'suggested',
      usedByCorrelation: false,
      dependsOn: { name: 'gw-atelier' },
    });
  });

  it('valide une suggestion : la fiche du PC indique alors sa passerelle', async () => {
    const { dependencies } = (await (await call('/dependencies?status=suggested')).json()) as DependencyGraphDto;
    const target = dependencies.find((d) => d.device.name === 'pc-atelier-01')!;

    const response = await call(`/dependencies/${target.id}`, 'PATCH', { status: 'validated' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'validated', usedByCorrelation: true });

    const detail = (await (await call(`/devices/${ids['pc-atelier-01']}`)).json()) as { device: { gateway: unknown } };
    expect(detail.device.gateway).toMatchObject({ name: 'gw-atelier' });
  });

  it('crée une dépendance manuelle et refuse un cycle en 409', async () => {
    const created = await call('/dependencies', 'POST', {
      deviceId: ids['pc-atelier-02'],
      dependsOnId: ids['pc-atelier-01'],
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ source: 'manual', status: 'validated' });

    const cycle = await call('/dependencies', 'POST', {
      deviceId: ids['gw-atelier'],
      dependsOnId: ids['pc-atelier-02'],
    });
    expect(cycle.status).toBe(409);
    await expect(cycle.json()).resolves.toMatchObject({
      error: { code: 'conflict', message: expect.stringContaining('créerait un cycle') },
    });
  });

  it('refuse une dépendance d’un équipement vers lui-même en 400', async () => {
    const response = await call('/dependencies', 'POST', { deviceId: ids['gw-atelier'], dependsOnId: ids['gw-atelier'] });
    expect(response.status).toBe(400);
  });

  it('supprimer une suggestion la rejette', async () => {
    const { dependencies } = (await (await call('/dependencies?status=suggested')).json()) as DependencyGraphDto;
    const response = await call(`/dependencies/${dependencies[0]!.id}`, 'DELETE');

    await expect(response.json()).resolves.toMatchObject({ outcome: 'rejected', dependency: { status: 'rejected' } });
  });

  it('signale la suggestion qui contredit une dépendance manuelle', async () => {
    // Le collecteur voit toujours pc-atelier-02 derrière gw-atelier ; la dépendance validée dit pc-atelier-01.
    const rejected = ((await (await call('/dependencies?status=rejected')).json()) as DependencyGraphDto).dependencies[0]!;
    await call(`/dependencies/${rejected.id}`, 'PATCH', { status: 'suggested' });

    const graph = (await (await call('/dependencies')).json()) as DependencyGraphDto;
    expect(graph.issues).toMatchObject([{ kind: 'conflict', severity: 'warning' }]);
  });

  it('renvoie 404 pour une dépendance inconnue', async () => {
    const response = await call('/dependencies/inconnue', 'PATCH', { status: 'validated' });
    expect(response.status).toBe(404);
  });

  it('valide en masse les suggestions restantes', async () => {
    const response = await call('/dependencies/validate-suggestions', 'POST');
    // La seule suggestion restante contredit une dépendance validée : elle est laissée à l'humain.
    await expect(response.json()).resolves.toEqual({ validated: 0, skipped: 1 });
    const graph = (await (await call('/dependencies')).json()) as { dependencies: DependencyDto[] };
    expect(graph.dependencies.filter((d) => d.status === 'validated')).toHaveLength(2);
  });
});
