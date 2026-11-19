import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ClassifyDevice } from '../../src/application/use-cases/devices.js';
import { IngestScanSnapshot } from '../../src/application/use-cases/ingest-scan-snapshot.js';
import type { Device } from '../../src/domain/entities/device.js';
import { strictSnapshotSchema, toDomainSnapshot } from '../../src/infrastructure/scanner/snapshot-schema.js';
import {
  InMemoryDependencyRepository,
  InMemoryDeviceDecisionRepository,
  InMemoryDeviceRepository,
  InMemoryEventRepository,
  InMemoryPolicyRepository,
  InMemoryThroughputRepository,
  sequentialIds,
} from '../support/in-memory-repositories.js';

const SCENARIOS = join(dirname(fileURLToPath(import.meta.url)), '../../../../tools/scanner-test/scenarios');

async function load(name: string) {
  const payload = JSON.parse(await readFile(join(SCENARIOS, `${name}.json`), 'utf8')) as unknown;
  return toDomainSnapshot(strictSnapshotSchema.parse(payload));
}

/**
 * Jeu de données « cas limites » (ticket #21) : on rejoue les trois photographies dans l'ordre,
 * par le même chemin qu'un vrai scan, et on vérifie ce que NetWatch en fait.
 */
describe('jeu de données fictif : cas limites', () => {
  const devices = new InMemoryDeviceRepository();
  const events = new InMemoryEventRepository();
  const ingest = new IngestScanSnapshot(
    devices,
    events,
    new InMemoryThroughputRepository(),
    new InMemoryPolicyRepository(),
    sequentialIds(),
    new InMemoryDependencyRepository(),
  );
  const classify = new ClassifyDevice(
    devices,
    events,
    new InMemoryDeviceDecisionRepository(),
    { now: () => new Date('2026-11-15T09:02:00Z') },
    sequentialIds('decision'),
  );
  const byIp = async (ip: string): Promise<Device | undefined> => (await devices.findAll()).find((d) => d.ip === ip);
  /** Types des événements ouverts sur l'équipement. */
  const openTypes = async (ip: string) => {
    const device = await byIp(ip);
    return (await events.findOpen()).filter((e) => e.deviceId === device?.id).map((e) => e.type).sort();
  };

  beforeAll(async () => {
    // 1. Référence, validée par un humain, puis rescannée : le parc est supervisé.
    const reference = await load('5-cas-limites-1-reference');
    await ingest.execute(reference);
    for (const device of await devices.findAll()) await classify.execute(device.id, { kind: 'server' }, 'test');
    await ingest.execute({ ...reference, scannedAt: new Date('2026-11-15T09:03:00Z') });
  });

  it('couvre plusieurs équipements, ports et services, dont un même port en TCP et UDP', async () => {
    expect((await devices.findAll()).map((d) => d.hostname).sort()).toEqual(['ap-hall', 'dns-int', 'imp-hall', 'srv-web']);
    expect((await byIp('192.168.20.53'))?.ports.map((p) => `${p.port}/${p.protocol}`)).toEqual(['53/tcp', '53/udp']);
    expect((await byIp('192.168.20.40'))?.ports[0]?.services.map((s) => s.name)).toEqual(['https', 'websocket']);
    // Telnet ouvert sur l'imprimante : port surveillé, signalé.
    expect(await openTypes('192.168.20.30')).toContain('exposed_port');
  });

  it('accueille un équipement inconnu (une IP et rien d’autre) comme machine à valider', async () => {
    await ingest.execute(await load('5-cas-limites-2-inconnu-et-services-disparus'));

    const unknown = await byIp('192.168.20.99');
    expect(unknown).toMatchObject({
      lifecycle: 'pending_classification',
      mac: null,
      hostname: null,
      vendor: null,
      kind: 'unknown',
      ports: [],
      latencyMs: null,
    });
    expect(await openTypes('192.168.20.99')).toEqual(['device_discovered']);
    expect((await byIp('192.168.20.98'))?.lifecycle).toBe('pending_classification');
  });

  it('retire les services disparus et referme ce qu’ils avaient ouvert', async () => {
    const web = await byIp('192.168.20.10');
    // SSH fermé ; HTTPS toujours ouvert mais plus identifié ; plus de certificat présenté.
    expect(web?.ports.map((p) => [p.port, p.services.map((s) => s.name)])).toEqual([
      [80, ['http']],
      [443, []],
    ]);
    expect(web?.certificates).toEqual([]);

    // Telnet coupé : le signalement se referme.
    expect((await byIp('192.168.20.30'))?.ports.map((p) => p.port)).toEqual([631, 9100]);
    expect(await openTypes('192.168.20.30')).toEqual([]);

    // Le service DNS en UDP a disparu, TCP reste.
    expect((await byIp('192.168.20.53'))?.ports.map((p) => `${p.port}/${p.protocol}`)).toEqual(['53/tcp']);

    // La borne Wi-Fi n'a pas répondu : panne.
    expect((await byIp('192.168.20.40'))?.reachability).toBe('down');
    expect(await openTypes('192.168.20.40')).toEqual(['device_unreachable']);
  });

  it('accepte les valeurs aux bornes du contrat sans erreur', async () => {
    const result = await ingest.execute(await load('5-cas-limites-3-valeurs-limites'));
    expect(result.devicesSeen).toBe(4);

    const web = await byIp('192.168.20.10');
    expect(web).toMatchObject({ cpuPercent: 100, latencyMs: 0, memory: { usedPercent: 0, totalMb: null } });
    expect(web?.ports.map((p) => `${p.port}/${p.protocol}`)).toContain('65535/udp');
    // Processeur et disque à 100 %, certificat expiré, certificat auto-signé.
    expect(await openTypes('192.168.20.10')).toEqual(
      expect.arrayContaining(['resource_saturation', 'tls_expiring', 'tls_invalid']),
    );
    expect((await byIp('192.168.20.30'))?.vendor).toBe('Société d’impression Hélios');

    // L'équipement inconnu a disparu, mais il n'était pas validé : aucune panne.
    expect((await byIp('192.168.20.99'))?.reachability).toBe('down');
    expect(await openTypes('192.168.20.99')).toEqual(['device_discovered']);
  });
});
