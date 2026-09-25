import { z } from 'zod';
import type { ScanSnapshot } from '../../application/ports/scanner-gateway.js';

/**
 * Format JSON attendu du scanner. Seuls les équipements qui ont répondu
 * figurent dans `devices` : une absence vaut « ne répond pas ».
 * Documentation complète : docs/scanner-contract.md
 */
export const snapshotSchema = z.object({
  scannedAt: z.string().datetime({ offset: true }),
  devices: z
    .array(
      z.object({
        ip: z.string().min(1),
        mac: z.string().nullish(),
        hostname: z.string().nullish(),
        vendor: z.string().nullish(),
        latencyMs: z.number().nonnegative().nullish(),
        openPorts: z.array(z.number().int().min(0).max(65_535)).default([]),
        certificates: z
          .array(
            z.object({
              port: z.number().int().min(0).max(65_535),
              subject: z.string(),
              issuer: z.string().nullish(),
              expiresAt: z.string().datetime({ offset: true }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  throughput: z
    .array(
      z.object({
        sourceIp: z.string().min(1),
        targetIp: z.string().nullish(),
        mbps: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export type SnapshotPayload = z.infer<typeof snapshotSchema>;

export function toDomainSnapshot(payload: SnapshotPayload): ScanSnapshot {
  return {
    scannedAt: new Date(payload.scannedAt),
    devices: payload.devices.map((device) => ({
      ip: device.ip,
      mac: device.mac ?? null,
      hostname: device.hostname ?? null,
      vendor: device.vendor ?? null,
      latencyMs: device.latencyMs ?? null,
      openPorts: device.openPorts,
      certificates: device.certificates.map((certificate) => ({
        port: certificate.port,
        subject: certificate.subject,
        issuer: certificate.issuer ?? null,
        expiresAt: new Date(certificate.expiresAt),
      })),
    })),
    throughput: payload.throughput.map((sample) => ({
      sourceIp: sample.sourceIp,
      targetIp: sample.targetIp ?? null,
      mbps: sample.mbps,
    })),
  };
}
