import { beforeEach, describe, expect, it } from 'vitest';
import type { ScanSnapshot } from '../../src/application/ports/scanner-gateway.js';
import { ClassifyDevice } from '../../src/application/use-cases/devices.js';
import { IngestScanSnapshot } from '../../src/application/use-cases/ingest-scan-snapshot.js';
import {
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
      latencyMs: 2,
      openPorts: [],
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
    ingest = new IngestScanSnapshot(devices, events, throughput, policies, sequentialIds());
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
