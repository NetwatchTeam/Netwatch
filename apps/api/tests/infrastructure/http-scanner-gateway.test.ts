import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { explainFetchError, HttpScannerGateway } from '../../src/infrastructure/scanner/http-scanner-gateway.js';

let servers: Server[] = [];

/** Faux scanner local ; `handler` décide de la réponse. */
async function startScanner(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Port libre sur lequel personne n'écoute : reproduit un scanner arrêté. */
async function closedPortUrl(): Promise<string> {
  const url = await startScanner(() => {});
  const server = servers.pop()!;
  await new Promise((resolve) => server.close(resolve));
  return url;
}

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  servers = [];
});

describe('passerelle HTTP du scanner', () => {
  it('explique qu’un scanner arrêté refuse la connexion', async () => {
    const gateway = new HttpScannerGateway({ baseUrl: await closedPortUrl(), timeoutMs: 2_000 });

    await expect(gateway.fetchSnapshot()).rejects.toThrow(/connexion refusée — le scanner n’est pas démarré.*ECONNREFUSED/);
  });

  it('signale un scanner qui ne répond pas dans le délai', async () => {
    const baseUrl = await startScanner(() => {
      /* ne répond jamais */
    });
    const gateway = new HttpScannerGateway({ baseUrl, timeoutMs: 200 });

    await expect(gateway.fetchSnapshot()).rejects.toThrow(/pas de réponse en 0.2 s/);
  });

  it('traite le délai interne de fetch comme un collecteur qui ne répond pas', () => {
    const error = new TypeError('fetch failed', { cause: Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' }) });

    expect(explainFetchError(error, 300_000)).toBe('pas de réponse en 5 min (SCANNER_TIMEOUT_MS)');
  });

  it('détaille l’écart quand le JSON ne suit pas le contrat', async () => {
    const baseUrl = await startScanner((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ scannedAt: 'hier', devices: [] }));
    });
    const gateway = new HttpScannerGateway({ baseUrl, timeoutMs: 2_000 });

    await expect(gateway.fetchSnapshot()).rejects.toThrow(/non conforme au contrat — scannedAt/);
  });

  it('lit une réponse conforme et transmet le jeton', async () => {
    let authorization: string | undefined;
    const baseUrl = await startScanner((req, res) => {
      authorization = req.headers.authorization;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          scannedAt: '2026-11-06T10:00:00Z',
          devices: [{ ip: '192.168.1.10', ports: [{ port: 443, services: [{ name: 'https' }] }] }],
        }),
      );
    });
    const gateway = new HttpScannerGateway({ baseUrl, token: 'secret', timeoutMs: 2_000 });

    const snapshot = await gateway.fetchSnapshot();

    expect(authorization).toBe('Bearer secret');
    expect(snapshot.devices[0]?.ports).toEqual([
      { port: 443, protocol: 'tcp', services: [{ name: 'https', product: null, version: null }] },
    ]);
  });
});
