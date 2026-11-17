import { describe, expect, it } from 'vitest';
import {
  applyMiss,
  applyObservation,
  createDiscoveredDevice,
  type Device,
  type DeviceObservation,
} from '../../src/domain/entities/device.js';
import { DEFAULT_POLICY } from '../../src/domain/policy.js';
import { detectExposedPorts } from '../../src/domain/rules/exposed-ports.js';
import { detectPacketLoss } from '../../src/domain/rules/packet-loss.js';
import type { DetectionIntent } from '../../src/domain/rules/intents.js';
import { detectDownstreamOutage, detectReachabilityChange } from '../../src/domain/rules/reachability.js';
import { detectResourceSaturation } from '../../src/domain/rules/resources.js';
import { detectTlsExpiry } from '../../src/domain/rules/tls-expiry.js';
import { detectTlsValidity } from '../../src/domain/rules/tls-validity.js';
import { Topology } from '../../src/domain/rules/topology.js';

const T0 = new Date('2026-09-14T08:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function observation(overrides: Partial<DeviceObservation> = {}): DeviceObservation {
  return {
    ip: '192.168.1.10',
    mac: 'aa:bb:cc:dd:ee:10',
    hostname: 'srv-fichiers',
    vendor: 'Dell',
    gatewayIp: null,
    latencyMs: 3,
    packetLossPercent: 0,
    cpuPercent: null,
    memory: null,
    disks: [],
    ports: [],
    certificates: [],
    ...overrides,
  };
}

const tcp = (...ports: number[]) => ports.map((port) => ({ port, protocol: 'tcp' as const, services: [] }));

function device(overrides: Partial<Device> = {}): Device {
  return { ...createDiscoveredDevice('dev-1', observation(), T0), lifecycle: 'active', ...overrides };
}

const solo = () => new Topology([]);

describe('détection des pannes', () => {
  it('ouvre un incident au premier scan sans réponse, avec le seuil par défaut', () => {
    const before = device();
    const after = applyMiss(before, new Date(T0.getTime() + 5 * 60_000), DEFAULT_POLICY.missedScansBeforeIncident);

    const intents = detectReachabilityChange(after, new Set(), after.lastChangeAt, solo());

    expect(after.reachability).toBe('down');
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ action: 'open' });
    if (intents[0]?.action === 'open') {
      expect(intents[0].event.type).toBe('device_unreachable');
      expect(intents[0].event.summary).toBe('srv-fichiers ne répond plus');
      // La panne est datée du changement d'état, pas du moment où on la constate.
      expect(intents[0].event.startedAt).toEqual(after.lastChangeAt);
    }
  });

  it('attend le seuil configuré avant de déclarer la panne', () => {
    const policy = { ...DEFAULT_POLICY, missedScansBeforeIncident: 3 };
    let current = device();

    for (let scan = 1; scan <= 2; scan += 1) {
      current = applyMiss(current, new Date(T0.getTime() + scan * 5 * 60_000), policy.missedScansBeforeIncident);
      expect(detectReachabilityChange(current, new Set(), T0, solo())).toEqual([]);
    }

    const third = applyMiss(current, new Date(T0.getTime() + 15 * 60_000), policy.missedScansBeforeIncident);
    expect(third.reachability).toBe('down');
    expect(detectReachabilityChange(third, new Set(), T0, solo())).toHaveLength(1);
  });

  it('referme l’incident au retour de l’équipement', () => {
    const down = { ...device(), reachability: 'down' as const, missedScans: 2 };
    const backUp = applyObservation(down, observation(), new Date(T0.getTime() + 10 * 60_000));

    const intents = detectReachabilityChange(backUp, new Set(['device_unreachable']), backUp.lastSeenAt, solo());

    expect(intents).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'device_unreachable', at: backUp.lastSeenAt },
    ]);
  });
});

describe('passerelles : panne de la passerelle ou panne des machines derrière elle', () => {
  const at = new Date(T0.getTime() + 5 * 60_000);
  const gateway = device({ id: 'gw', ip: '10.0.0.1', hostname: 'gw-atelier' });
  const pcs = [1, 2, 3].map((n) =>
    device({ id: `pc-${n}`, ip: `10.0.1.${n}`, hostname: `pc-atelier-0${n}`, gatewayIp: '10.0.0.1' }),
  );
  // Dépendances validées : chaque PC est joint via gw-atelier.
  const edges = pcs.map((pc) => ({ deviceId: pc.id, dependsOnId: 'gw' }));
  const miss = (d: Device) => applyMiss(d, at, 1);
  const opened = (intents: DetectionIntent[]) => intents.flatMap((i) => (i.action === 'open' ? [i.event] : []));

  it('passerelle en panne : la passerelle porte la panne, ses machines sont injoignables', () => {
    const parc = Topology.resolveReachability([miss(gateway), ...pcs.map(miss)], edges);
    const topology = new Topology(parc, edges);
    const [gw, ...cut] = parc;

    expect(gw!.reachability).toBe('down');
    expect(cut.map((d) => d.reachability)).toEqual(['unreachable', 'unreachable', 'unreachable']);

    const [gatewayIncident] = opened(detectReachabilityChange(gw!, new Set(), at, topology));
    expect(gatewayIncident).toMatchObject({
      severity: 'critical',
      summary: 'La passerelle gw-atelier en panne : 3 machine(s) sur 3 derrière elle sont injoignables',
    });

    const [pcIncident] = opened(detectReachabilityChange(cut[0]!, new Set(), at, topology));
    expect(pcIncident).toMatchObject({
      severity: 'info',
      peerDeviceId: 'gw',
      summary: 'pc-atelier-01 injoignable : sa passerelle gw-atelier est en panne',
    });

    // Ce n'est pas une panne « en aval » : la passerelle elle-même est tombée.
    expect(detectDownstreamOutage(gw!, new Set(), at, topology)).toEqual([]);
  });

  it('passerelle qui répond mais toutes ses machines en panne : panne en aval signalée sur la passerelle', () => {
    const parc = Topology.resolveReachability([gateway, ...pcs.map(miss)], edges);
    const topology = new Topology(parc, edges);
    const [gw, ...down] = parc;

    expect(down.map((d) => d.reachability)).toEqual(['down', 'down', 'down']);
    expect(opened(detectReachabilityChange(down[0]!, new Set(), at, topology))[0]).toMatchObject({
      severity: 'warning',
      summary: 'pc-atelier-01 ne répond plus (sa passerelle gw-atelier répond)',
    });

    const [downstream] = opened(detectDownstreamOutage(gw!, new Set(), at, topology));
    expect(downstream).toMatchObject({ type: 'downstream_outage', severity: 'critical' });
    expect(downstream?.summary).toContain(
      'Les 3 machines derrière gw-atelier ne répondent plus alors que la passerelle répond',
    );
  });

  it('une seule machine en panne derrière une passerelle saine n’est pas une panne en aval', () => {
    const topology = new Topology(Topology.resolveReachability([gateway, miss(pcs[0]!), pcs[1]!, pcs[2]!], edges), edges);
    expect(detectDownstreamOutage(gateway, new Set(), at, topology)).toEqual([]);
  });

  it('referme la panne en aval dès qu’une machine revient', () => {
    const topology = new Topology([gateway, miss(pcs[0]!), pcs[1]!, miss(pcs[2]!)], edges);
    expect(detectDownstreamOutage(gateway, new Set(['downstream_outage']), at, topology)).toEqual([
      { action: 'resolve', deviceId: 'gw', dedupeKey: 'downstream_outage', at },
    ]);
  });

  it('une machine derrière deux passerelles en cascade est injoignable si la première tombe', () => {
    const core = device({ id: 'core', ip: '10.0.0.254', hostname: 'routeur-coeur' });
    const cascade = [
      { deviceId: 'gw', dependsOnId: 'core' },
      { deviceId: 'pc-1', dependsOnId: 'gw' },
    ];
    const parc = Topology.resolveReachability([miss(core), miss(gateway), miss(pcs[0]!)], cascade);
    expect(parc.map((d) => d.reachability)).toEqual(['down', 'unreachable', 'unreachable']);
  });

  it('requalifie l’incident quand la passerelle revient mais pas la machine', () => {
    const stillMissing = { ...miss(pcs[0]!), reachability: 'down' as const };
    const topology = new Topology([gateway, stillMissing], edges);

    const [intent] = detectReachabilityChange(stillMissing, new Set(['device_unreachable']), at, topology);

    expect(intent).toMatchObject({
      action: 'update',
      severity: 'warning',
      peerDeviceId: null,
      summary: 'pc-atelier-01 ne répond plus (sa passerelle gw-atelier répond)',
    });
  });

  it('garde la date de début quand une machine injoignable devient en panne', () => {
    const unreachable = { ...pcs[0]!, reachability: 'unreachable' as const, lastChangeAt: T0, missedScans: 1 };
    expect(applyMiss(unreachable, at, 1).lastChangeAt).toEqual(T0);
  });
});

describe('passerelles : la topologie ignore ce que le collecteur n’a fait que suggérer', () => {
  it('sans dépendance validée, une machine dont la passerelle est en panne reste « en panne »', () => {
    const at = new Date(T0.getTime() + 5 * 60_000);
    const gateway = applyMiss(device({ id: 'gw', ip: '10.0.0.1' }), at, 1);
    const pc = applyMiss(device({ id: 'pc', ip: '10.0.1.1', gatewayIp: '10.0.0.1' }), at, 1);
    expect(Topology.resolveReachability([gateway, pc]).map((d) => d.reachability)).toEqual(['down', 'down']);
  });
});

describe('ports exposés', () => {
  it('signale un port surveillé puis referme le signalement quand il est fermé', () => {
    const exposed = device({ ports: tcp(80, 3389) });
    const opened = detectExposedPorts(exposed, new Set(), DEFAULT_POLICY, T0);

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ action: 'open' });
    if (opened[0]?.action === 'open') {
      expect(opened[0].event.dedupeKey).toBe('exposed_port:3389');
      expect(opened[0].event.summary).toContain('bureau à distance');
    }

    const closed = device({ ports: tcp(80) });
    expect(detectExposedPorts(closed, new Set(['exposed_port:3389']), DEFAULT_POLICY, T0)).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'exposed_port:3389', at: T0 },
    ]);
  });
});

describe('expiration des certificats TLS', () => {
  const certificate = (days: number) => ({
    port: 443,
    subject: 'CN=srv.local',
    issuer: 'Interne',
    validFrom: null,
    expiresAt: new Date(T0.getTime() + days * DAY_MS),
    valid: true,
    validationError: null,
  });

  it('n’alerte pas au-delà du préavis de 30 jours', () => {
    const subject = device({ certificates: [certificate(45)] });
    expect(detectTlsExpiry(subject, new Set(), DEFAULT_POLICY, T0)).toEqual([]);
  });

  it('alerte dès que l’échéance entre dans le préavis', () => {
    const subject = device({ certificates: [certificate(30)] });
    const intents = detectTlsExpiry(subject, new Set(), DEFAULT_POLICY, T0);

    expect(intents).toHaveLength(1);
    if (intents[0]?.action === 'open') {
      expect(intents[0].event.severity).toBe('warning');
      expect(intents[0].event.details?.daysBeforeExpiry).toBe(30);
    }
  });

  it('passe en critique à moins d’une semaine sans créer de doublon', () => {
    const subject = device({ certificates: [certificate(5)] });
    const intents = detectTlsExpiry(subject, new Set(['tls_expiring:443']), DEFAULT_POLICY, T0);

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ action: 'update', severity: 'critical' });
  });

  it('referme le signalement après renouvellement', () => {
    const renewed = device({ certificates: [certificate(365)] });
    expect(detectTlsExpiry(renewed, new Set(['tls_expiring:443']), DEFAULT_POLICY, T0)).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'tls_expiring:443', at: T0 },
    ]);
  });
});

describe('services associés aux ports', () => {
  it('reprend le service détecté par le scanner quand le port n’a pas de libellé maison', () => {
    const policy = { ...DEFAULT_POLICY, watchedPorts: [8080] };
    const subject = device({
      ports: [{ port: 8080, protocol: 'tcp', services: [{ name: 'http', product: 'Apache Tomcat', version: '9.0' }] }],
    });

    const [intent] = detectExposedPorts(subject, new Set(), policy, T0);

    expect(intent).toMatchObject({ action: 'open' });
    if (intent?.action === 'open') {
      expect(intent.event.summary).toContain('http Apache Tomcat 9.0');
      expect(intent.event.details?.detectedService).toBe('http Apache Tomcat 9.0');
    }
  });
});

describe('validation des certificats TLS', () => {
  const certificate = (overrides: Partial<Device['certificates'][number]> = {}) => ({
    port: 443,
    subject: 'CN=srv.local',
    issuer: 'CN=srv.local',
    validFrom: new Date(T0.getTime() - 30 * DAY_MS),
    expiresAt: new Date(T0.getTime() + 300 * DAY_MS),
    valid: false,
    validationError: 'certificat auto-signé',
    ...overrides,
  });

  it('signale un certificat refusé par la vérification, avec la raison', () => {
    const intents = detectTlsValidity(device({ certificates: [certificate()] }), new Set(), T0);

    expect(intents).toHaveLength(1);
    if (intents[0]?.action === 'open') {
      expect(intents[0].event.type).toBe('tls_invalid');
      expect(intents[0].event.dedupeKey).toBe('tls_invalid:443');
      expect(intents[0].event.summary).toContain('auto-signé');
    }
  });

  it('ignore un certificat valide ou non vérifié', () => {
    const subject = device({ certificates: [certificate({ valid: true }), certificate({ port: 8443, valid: null })] });
    expect(detectTlsValidity(subject, new Set(), T0)).toEqual([]);
  });

  it('laisse un certificat expiré à la règle d’expiration', () => {
    const expired = certificate({ expiresAt: new Date(T0.getTime() - DAY_MS), validationError: 'expiré' });
    expect(detectTlsValidity(device({ certificates: [expired] }), new Set(), T0)).toEqual([]);
  });

  it('referme le signalement quand le certificat est corrigé', () => {
    const fixed = device({ certificates: [certificate({ valid: true, validationError: null })] });
    expect(detectTlsValidity(fixed, new Set(['tls_invalid:443']), T0)).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'tls_invalid:443', at: T0 },
    ]);
  });
});

describe('perte de paquets', () => {
  it('ouvre une observation au-delà du seuil, critique au-delà de 50 %', () => {
    const [warning] = detectPacketLoss(device({ packetLossPercent: 12 }), new Set(), DEFAULT_POLICY, T0);
    expect(warning).toMatchObject({ action: 'open', event: { type: 'packet_loss', severity: 'warning' } });

    const [critical] = detectPacketLoss(device({ packetLossPercent: 60 }), new Set(['packet_loss']), DEFAULT_POLICY, T0);
    expect(critical).toMatchObject({ action: 'update', severity: 'critical' });
  });

  it('referme l’observation sous le seuil, mais pas en l’absence de mesure', () => {
    expect(detectPacketLoss(device({ packetLossPercent: 1 }), new Set(['packet_loss']), DEFAULT_POLICY, T0)).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'packet_loss', at: T0 },
    ]);
    expect(detectPacketLoss(device({ packetLossPercent: null }), new Set(['packet_loss']), DEFAULT_POLICY, T0)).toEqual(
      [],
    );
  });
});

describe('saturation des ressources', () => {
  it('ouvre un événement par ressource au-dessus de son seuil', () => {
    const subject = device({
      cpuPercent: 95,
      memory: { usedPercent: 50, totalMb: 16_384 },
      disks: [
        { name: 'C:', usedPercent: 99, totalGb: 238 },
        { name: 'D:', usedPercent: 40, totalGb: 1_863 },
      ],
    });

    const intents = detectResourceSaturation(subject, new Set(), DEFAULT_POLICY, T0);
    const opened = intents.flatMap((intent) => (intent.action === 'open' ? [intent.event] : []));

    expect(opened.map((event) => event.dedupeKey)).toEqual(['resource:cpu', 'resource:disk:C:']);
    expect(opened.map((event) => event.severity)).toEqual(['warning', 'critical']);
    expect(opened[1]?.summary).toContain('disque C:');
  });

  it('referme ce qui est redescendu et garde ce qui n’a pas été mesuré', () => {
    const subject = device({ cpuPercent: 20, memory: null, disks: [] });
    const open = new Set(['resource:cpu', 'resource:memory', 'resource:disk:C:']);

    expect(detectResourceSaturation(subject, open, DEFAULT_POLICY, T0)).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'resource:cpu', at: T0 },
    ]);
  });

  it('referme l’alerte d’un disque qui n’est plus remonté', () => {
    const subject = device({ disks: [{ name: 'C:', usedPercent: 30, totalGb: 238 }] });
    expect(detectResourceSaturation(subject, new Set(['resource:disk:E:']), DEFAULT_POLICY, T0)).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'resource:disk:E:', at: T0 },
    ]);
  });
});

describe('mesures d’une machine qui ne répond plus', () => {
  it('efface les mesures instantanées mais garde disques, ports et certificats', () => {
    const before = device({
      packetLossPercent: 3,
      cpuPercent: 40,
      memory: { usedPercent: 60, totalMb: 8_192 },
      disks: [{ name: 'C:', usedPercent: 70, totalGb: 238 }],
      ports: tcp(443),
    });
    const after = applyMiss(before, T0, 1);

    expect(after).toMatchObject({ latencyMs: null, packetLossPercent: null, cpuPercent: null, memory: null });
    expect(after.disks).toEqual(before.disks);
    expect(after.ports).toEqual(before.ports);
  });
});
