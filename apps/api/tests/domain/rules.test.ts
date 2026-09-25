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
import { detectReachabilityChange } from '../../src/domain/rules/reachability.js';
import { detectTlsExpiry } from '../../src/domain/rules/tls-expiry.js';

const T0 = new Date('2026-09-14T08:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function observation(overrides: Partial<DeviceObservation> = {}): DeviceObservation {
  return {
    ip: '192.168.1.10',
    mac: 'aa:bb:cc:dd:ee:10',
    hostname: 'srv-fichiers',
    vendor: 'Dell',
    latencyMs: 3,
    openPorts: [],
    certificates: [],
    ...overrides,
  };
}

function device(overrides: Partial<Device> = {}): Device {
  return { ...createDiscoveredDevice('dev-1', observation(), T0), lifecycle: 'active', ...overrides };
}

describe('détection des pannes', () => {
  it('ouvre un incident au premier scan sans réponse, avec le seuil par défaut', () => {
    const before = device();
    const after = applyMiss(before, new Date(T0.getTime() + 5 * 60_000), DEFAULT_POLICY.missedScansBeforeIncident);

    const intents = detectReachabilityChange(before, after, new Set(), after.lastChangeAt);

    expect(after.reachability).toBe('down');
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ action: 'open' });
    if (intents[0]?.action === 'open') {
      expect(intents[0].event.type).toBe('device_unreachable');
      // La panne est datée du changement d'état, pas du moment où on la constate.
      expect(intents[0].event.startedAt).toEqual(after.lastChangeAt);
    }
  });

  it('attend le seuil configuré avant de déclarer la panne', () => {
    const policy = { ...DEFAULT_POLICY, missedScansBeforeIncident: 3 };
    let current = device();

    for (let scan = 1; scan <= 2; scan += 1) {
      const next = applyMiss(current, new Date(T0.getTime() + scan * 5 * 60_000), policy.missedScansBeforeIncident);
      expect(detectReachabilityChange(current, next, new Set(), T0)).toEqual([]);
      current = next;
    }

    const third = applyMiss(current, new Date(T0.getTime() + 15 * 60_000), policy.missedScansBeforeIncident);
    expect(third.reachability).toBe('down');
    expect(detectReachabilityChange(current, third, new Set(), T0)).toHaveLength(1);
  });

  it('referme l’incident au retour de l’équipement', () => {
    const down = { ...device(), reachability: 'down' as const, missedScans: 2 };
    const backUp = applyObservation(down, observation(), new Date(T0.getTime() + 10 * 60_000));

    const intents = detectReachabilityChange(down, backUp, new Set(['device_unreachable']), backUp.lastSeenAt);

    expect(intents).toEqual([
      { action: 'resolve', deviceId: 'dev-1', dedupeKey: 'device_unreachable', at: backUp.lastSeenAt },
    ]);
  });
});

describe('ports exposés', () => {
  it('signale un port surveillé puis referme le signalement quand il est fermé', () => {
    const exposed = device({ openPorts: [80, 3389] });
    const opened = detectExposedPorts(exposed, new Set(), DEFAULT_POLICY, T0);

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ action: 'open' });
    if (opened[0]?.action === 'open') {
      expect(opened[0].event.dedupeKey).toBe('exposed_port:3389');
      expect(opened[0].event.summary).toContain('bureau à distance');
    }

    const closed = device({ openPorts: [80] });
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
    expiresAt: new Date(T0.getTime() + days * DAY_MS),
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
