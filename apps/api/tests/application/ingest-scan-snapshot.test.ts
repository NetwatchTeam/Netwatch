import { beforeEach, describe, expect, it } from 'vitest';
import type { ScanSnapshot } from '../../src/application/ports/scanner-gateway.js';
import { ValidateAllSuggestions } from '../../src/application/use-cases/dependencies.js';
import { ClassifyDevice } from '../../src/application/use-cases/devices.js';
import { IngestScanSnapshot } from '../../src/application/use-cases/ingest-scan-snapshot.js';
import {
  InMemoryDependencyRepository,
  InMemoryDeviceRepository,
  InMemoryEventRepository,
  InMemoryPolicyRepository,
  InMemoryThroughputRepository,
  sequentialIds,
} from '../support/in-memory-repositories.js';

const T0 = new Date('2026-09-14T08:00:00Z');

function snapshot(at: Date, ips: string[], extras: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    scannedAt: at,
    devices: ips.map((ip) => ({
      ip,
      mac: `aa:bb:cc:00:00:${ip.split('.').pop()!.padStart(2, '0')}`,
      hostname: `hote-${ip.split('.').pop()}`,
      vendor: 'Dell',
      gatewayIp: null,
      latencyMs: 2,
      packetLossPercent: 0,
      cpuPercent: null,
      memory: null,
      disks: [],
      ports: [],
      certificates: [],
    })),
    throughput: [],
    ...extras,
  };
}

describe('ingestion d’un scan', () => {
  let devices: InMemoryDeviceRepository;
  let events: InMemoryEventRepository;
  let throughput: InMemoryThroughputRepository;
  let policies: InMemoryPolicyRepository;
  let ingest: IngestScanSnapshot;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    events = new InMemoryEventRepository();
    throughput = new InMemoryThroughputRepository();
    policies = new InMemoryPolicyRepository();
    ingest = new IngestScanSnapshot(devices, events, throughput, policies, sequentialIds(), new InMemoryDependencyRepository());
  });

  it('enregistre une machine inconnue en attente de classement', async () => {
    const result = await ingest.execute(snapshot(T0, ['192.168.1.10']));

    const [device] = await devices.findAll();
    expect(result.devicesDiscovered).toBe(1);
    expect(device?.lifecycle).toBe('pending_classification');
    expect(device?.kind).toBe('unknown');

    const open = await events.findOpen();
    expect(open).toHaveLength(1);
    expect(open[0]?.type).toBe('device_discovered');
  });

  it('maintient l’attente de classement scan après scan', async () => {
    await ingest.execute(snapshot(T0, ['192.168.1.10']));
    await ingest.execute(snapshot(new Date(T0.getTime() + 5 * 60_000), ['192.168.1.10']));

    const [device] = await devices.findAll();
    expect(device?.lifecycle).toBe('pending_classification');
    // Un seul événement d'ajout, pas un par scan.
    expect((await events.findOpen()).filter((e) => e.type === 'device_discovered')).toHaveLength(1);
  });

  it('referme l’attente quand un utilisateur déclare ce qu’est la machine', async () => {
    await ingest.execute(snapshot(T0, ['192.168.1.10']));
    const [discovered] = await devices.findAll();

    const classify = new ClassifyDevice(devices, events, { now: () => new Date(T0.getTime() + 60_000) });
    const classified = await classify.execute(discovered!.id, {
      kind: 'server',
      label: 'Serveur de fichiers',
      critical: true,
    });

    expect(classified.lifecycle).toBe('active');
    expect(await events.findOpen()).toHaveLength(0);
  });

  it('ouvre puis referme un incident selon la présence de la machine', async () => {
    await ingest.execute(snapshot(T0, ['192.168.1.10']));

    const absent = await ingest.execute(snapshot(new Date(T0.getTime() + 5 * 60_000), []));
    expect(absent.eventsOpened).toBe(1);
    const incident = (await events.findOpen()).find((event) => event.type === 'device_unreachable');
    expect(incident?.status).toBe('open');
    expect((await devices.findAll())[0]?.reachability).toBe('down');

    const back = await ingest.execute(snapshot(new Date(T0.getTime() + 10 * 60_000), ['192.168.1.10']));
    expect(back.eventsResolved).toBe(1);
    expect((await events.findById(incident!.id))?.status).toBe('resolved');
  });

  it('reconnaît une machine qui a changé d’adresse IP grâce à son adresse MAC', async () => {
    await ingest.execute(snapshot(T0, ['192.168.1.10']));
    const [before] = await devices.findAll();

    const moved = snapshot(new Date(T0.getTime() + 5 * 60_000), ['192.168.1.10']);
    moved.devices[0]!.ip = '192.168.1.55';
    await ingest.execute(moved);

    const all = await devices.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(before?.id);
    expect(all[0]?.ip).toBe('192.168.1.55');
  });

  it('signale une chute de débit par rapport à la référence', async () => {
    await ingest.execute(snapshot(T0, ['192.168.1.10', '192.168.1.11']));
    throughput.baselineValue = 900;

    await ingest.execute({
      ...snapshot(new Date(T0.getTime() + 5 * 60_000), ['192.168.1.10', '192.168.1.11']),
      throughput: [{ sourceIp: '192.168.1.10', targetIp: '192.168.1.11', mbps: 120 }],
    });

    const observation = (await events.findOpen()).find((event) => event.type === 'throughput_degraded');
    expect(observation?.category).toBe('observation');
    expect(observation?.details.baselineMbps).toBe(900);
    expect(throughput.items).toHaveLength(1);
  });
});

describe('ingestion : passerelle en panne ou panne derrière la passerelle', () => {
  const GW = '10.20.0.12';
  const network = (withGateway: boolean, withPcs: boolean, at: Date): ScanSnapshot => ({
    scannedAt: at,
    devices: [
      ...(withGateway ? [{ ip: GW, hostname: 'gw-atelier', gatewayIp: null }] : []),
      ...(withPcs
        ? [1, 2, 3].map((n) => ({ ip: `10.20.12.${10 + n}`, hostname: `pc-atelier-0${n}`, gatewayIp: GW }))
        : []),
    ].map((d) => ({
      ...d,
      mac: null,
      vendor: null,
      latencyMs: 1,
      packetLossPercent: 0,
      cpuPercent: null,
      memory: null,
      disks: [],
      ports: [],
      certificates: [],
    })),
    throughput: [],
  });
  const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

  it('distingue les deux situations puis referme tout au retour à la normale', async () => {
    const devices = new InMemoryDeviceRepository();
    const events = new InMemoryEventRepository();
    const dependencies = new InMemoryDependencyRepository();
    const ingest = new IngestScanSnapshot(
      devices,
      events,
      new InMemoryThroughputRepository(),
      new InMemoryPolicyRepository(),
      sequentialIds(),
      dependencies,
    );
    const state = async () =>
      Object.fromEntries((await devices.findAll()).map((d) => [d.hostname, d.reachability]));
    const openIncidents = async () =>
      (await events.findOpen())
        .filter((e) => e.category === 'incident')
        .map((e) => `${e.type}|${e.severity}|${e.summary}`)
        .sort();

    await ingest.execute(network(true, true, at(0)));
    // Les passerelles vues par le collecteur ne sont que des suggestions : un humain les valide.
    expect((await dependencies.list()).map((d) => d.status)).toEqual(['suggested', 'suggested', 'suggested']);
    await new ValidateAllSuggestions(dependencies, { now: () => at(1) }).execute();

    // 1. La passerelle tombe : elle et ses PC disparaissent du scan.
    await ingest.execute(network(false, false, at(5)));
    expect(await state()).toEqual({
      'gw-atelier': 'down',
      'pc-atelier-01': 'unreachable',
      'pc-atelier-02': 'unreachable',
      'pc-atelier-03': 'unreachable',
    });
    expect(await openIncidents()).toEqual([
      'device_unreachable|critical|La passerelle gw-atelier en panne : 3 machine(s) sur 3 derrière elle sont injoignables',
      'device_unreachable|info|pc-atelier-01 injoignable : sa passerelle gw-atelier est en panne',
      'device_unreachable|info|pc-atelier-02 injoignable : sa passerelle gw-atelier est en panne',
      'device_unreachable|info|pc-atelier-03 injoignable : sa passerelle gw-atelier est en panne',
    ]);

    // 2. La passerelle revient, mais pas les PC : la panne est en aval.
    await ingest.execute(network(true, false, at(10)));
    expect(Object.values(await state())).toEqual(['up', 'down', 'down', 'down']);
    const incidents = await openIncidents();
    expect(incidents).toHaveLength(4);
    expect(incidents[0]).toMatch(
      /^device_unreachable\|warning\|pc-atelier-01 ne répond plus \(sa passerelle gw-atelier répond\)$/,
    );
    expect(incidents[3]).toMatch(/^downstream_outage\|critical\|Les 3 machines derrière gw-atelier ne répondent plus/);
    // Les pannes des PC sont restées les mêmes (requalifiées), datées du début de la coupure.
    const pcIncident = (await events.findOpen()).find((e) => e.summary.startsWith('pc-atelier-01'));
    expect(pcIncident?.startedAt).toEqual(at(5));
    expect(pcIncident?.peerDeviceId).toBeNull();

    // 3. Tout revient.
    await ingest.execute(network(true, true, at(15)));
    expect(await openIncidents()).toEqual([]);
  });
});

describe('ingestion : seules les dépendances validées servent à la corrélation', () => {
  it('sans validation, une machine derrière une passerelle en panne est simplement « en panne »', async () => {
    const devices = new InMemoryDeviceRepository();
    const dependencies = new InMemoryDependencyRepository();
    const ingest = new IngestScanSnapshot(
      devices,
      new InMemoryEventRepository(),
      new InMemoryThroughputRepository(),
      new InMemoryPolicyRepository(),
      sequentialIds(),
      dependencies,
    );
    const host = (ip: string, gatewayIp: string | null) => ({
      ip, mac: null, hostname: ip, vendor: null, gatewayIp, latencyMs: 1, packetLossPercent: 0,
      cpuPercent: null, memory: null, disks: [], ports: [], certificates: [],
    });

    await ingest.execute({ scannedAt: T0, devices: [host('10.0.0.1', null), host('10.0.1.5', '10.0.0.1')], throughput: [] });
    await ingest.execute({ scannedAt: new Date(T0.getTime() + 300_000), devices: [], throughput: [] });

    expect((await devices.findAll()).map((d) => d.reachability)).toEqual(['down', 'down']);
    expect((await dependencies.list())[0]).toMatchObject({ status: 'suggested', source: 'discovered' });
  });

  it('ne repropose pas une suggestion rejetée', async () => {
    const dependencies = new InMemoryDependencyRepository();
    const ingest = new IngestScanSnapshot(
      new InMemoryDeviceRepository(),
      new InMemoryEventRepository(),
      new InMemoryThroughputRepository(),
      new InMemoryPolicyRepository(),
      sequentialIds(),
      dependencies,
    );
    const snapshot = (at: Date): ScanSnapshot => ({
      scannedAt: at,
      devices: [
        { ip: '10.0.0.1', gatewayIp: null },
        { ip: '10.0.1.5', gatewayIp: '10.0.0.1' },
      ].map((d) => ({ ...d, mac: null, hostname: d.ip, vendor: null, latencyMs: 1, packetLossPercent: 0,
        cpuPercent: null, memory: null, disks: [], ports: [], certificates: [] })),
      throughput: [],
    });

    await ingest.execute(snapshot(T0));
    const [suggestion] = await dependencies.list();
    await dependencies.saveMany([{ ...suggestion!, status: 'rejected' }]);
    await ingest.execute(snapshot(new Date(T0.getTime() + 300_000)));

    expect((await dependencies.list()).map((d) => d.status)).toEqual(['rejected']);
  });
});
