import { describe, expect, it } from 'vitest';
import { snapshotSchema, toDomainSnapshot } from '../../src/infrastructure/scanner/snapshot-schema.js';

/** Exemple du contrat (docs/scanner-contract.md) : s'il change, ce test doit suivre. */
const CONTRACT_EXAMPLE = {
  scannedAt: '2026-09-20T08:00:00Z',
  devices: [
    {
      ip: '192.168.1.10',
      mac: '3c:52:82:4a:10:10',
      hostname: 'srv-erp',
      vendor: 'Dell',
      latencyMs: 3.2,
      packetLossPercent: 0,
      cpuPercent: 37.5,
      memory: { usedPercent: 68.2, totalMb: 32768 },
      disks: [
        { name: 'C:', usedPercent: 71.4, totalGb: 476.9 },
        { name: 'E:', usedPercent: 92.8, totalGb: 1863 },
      ],
      ports: [
        { port: 443, protocol: 'tcp', services: [{ name: 'https', product: 'Microsoft IIS httpd', version: '10.0' }] },
        { port: 1433, protocol: 'tcp', services: [{ name: 'ms-sql-s', product: 'Microsoft SQL Server 2019' }] },
        { port: 3389, protocol: 'tcp', services: [{ name: 'ms-wbt-server' }] },
      ],
      certificates: [
        {
          port: 443,
          subject: 'CN=srv-erp.exemple.local',
          issuer: 'CN=AC interne',
          validFrom: '2025-10-15T00:00:00Z',
          expiresAt: '2026-10-15T23:59:59Z',
          valid: false,
          validationError: 'chaîne de confiance incomplète',
        },
      ],
    },
    { ip: '192.168.1.30', latencyMs: 1.1, ports: [{ port: 9100 }] },
  ],
  throughput: [{ sourceIp: '192.168.1.60', targetIp: '192.168.1.10', mbps: 912.4 }],
};

describe('format JSON du scanner', () => {
  it('accepte l’exemple du contrat et le traduit fidèlement', () => {
    const snapshot = toDomainSnapshot(snapshotSchema.parse(CONTRACT_EXAMPLE));
    const [erp] = snapshot.devices;

    expect(erp).toMatchObject({
      packetLossPercent: 0,
      cpuPercent: 37.5,
      memory: { usedPercent: 68.2, totalMb: 32768 },
      disks: [
        { name: 'C:', usedPercent: 71.4, totalGb: 476.9 },
        { name: 'E:', usedPercent: 92.8, totalGb: 1863 },
      ],
    });
    expect(erp?.ports[1]).toEqual({
      port: 1433,
      protocol: 'tcp',
      services: [{ name: 'ms-sql-s', product: 'Microsoft SQL Server 2019', version: null }],
    });
    expect(erp?.certificates[0]).toMatchObject({
      validFrom: new Date('2025-10-15T00:00:00Z'),
      valid: false,
      validationError: 'chaîne de confiance incomplète',
    });
  });

  it('complète les champs facultatifs d’un équipement sans agent', () => {
    const snapshot = toDomainSnapshot(snapshotSchema.parse(CONTRACT_EXAMPLE));
    expect(snapshot.devices[1]).toMatchObject({
      packetLossPercent: null,
      cpuPercent: null,
      memory: null,
      disks: [],
      ports: [{ port: 9100, protocol: 'tcp', services: [] }],
      certificates: [],
    });
  });

  it('rejette un pourcentage hors bornes', () => {
    const invalid = {
      ...CONTRACT_EXAMPLE,
      devices: [{ ip: '192.168.1.10', cpuPercent: 140 }],
    };
    expect(snapshotSchema.safeParse(invalid).success).toBe(false);
  });
});
