import { CONTRACT_VERSION } from '@netwatch/contracts';
import { z } from 'zod';

const SUPPORTED_MAJOR = CONTRACT_VERSION.split('.')[0]!;
import type { ScanSnapshot } from '../../application/ports/scanner-gateway.js';

const percent = z.number().min(0).max(100);
const isoDate = z.string().datetime({ offset: true });
const portNumber = z.number().int().min(0).max(65_535);

const serviceSchema = z.object({
  /** Nom du service (`https`, `ssh`, `ms-sql-s`…). */
  name: z.string().min(1),
  /** Logiciel identifié (`nginx`, `OpenSSH`, `Microsoft IIS httpd`…). */
  product: z.string().nullish(),
  version: z.string().nullish(),
});

const portSchema = z.object({
  port: portNumber,
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  services: z.array(serviceSchema).default([]),
});

const certificateSchema = z.object({
  port: portNumber,
  subject: z.string(),
  issuer: z.string().nullish(),
  validFrom: isoDate.nullish(),
  expiresAt: isoDate,
  /** Résultat de la vérification par le scanner ; absent = non vérifié. */
  valid: z.boolean().nullish(),
  validationError: z.string().nullish(),
});

/**
 * Format JSON attendu du scanner. Seuls les équipements qui ont répondu
 * figurent dans `devices` : une absence vaut « ne répond pas ».
 * Documentation complète : docs/scanner-contract.md
 */
export const snapshotSchema = z.object({
  /**
   * Version du contrat que respecte le collecteur (« 1.0.0 », ou simplement « 1 »).
   * Facultative ; si elle est fournie, sa version majeure doit être celle de l'API.
   */
  contractVersion: z
    .string()
    .regex(/^\d+(\.\d+){0,2}$/, 'format attendu : MAJEUR[.MINEUR[.CORRECTIF]]')
    .refine((version) => version.split('.')[0] === SUPPORTED_MAJOR, {
      message: `version majeure non prise en charge : l'API attend ${SUPPORTED_MAJOR}.x (contrat ${CONTRACT_VERSION})`,
    })
    .optional(),
  scannedAt: isoDate,
  devices: z
    .array(
      z.object({
        ip: z.string().min(1),
        mac: z.string().nullish(),
        hostname: z.string().nullish(),
        vendor: z.string().nullish(),
        /** IP (telle qu'elle figure dans `devices[].ip`) de l'équipement par lequel la machine est jointe. */
        gatewayIp: z.string().min(1).nullish(),

        // Qualité de la liaison
        latencyMs: z.number().nonnegative().nullish(),
        packetLossPercent: percent.nullish(),

        // Ressources (absentes pour un équipement sans agent : imprimante, caméra…)
        cpuPercent: percent.nullish(),
        memory: z
          .object({
            usedPercent: percent,
            totalMb: z.number().nonnegative().nullish(),
          })
          .nullish(),
        disks: z
          .array(
            z.object({
              name: z.string().min(1),
              usedPercent: percent,
              totalGb: z.number().nonnegative().nullish(),
            }),
          )
          .default([]),

        // Exposition
        ports: z.array(portSchema).default([]),
        certificates: z.array(certificateSchema).default([]),
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
      gatewayIp: device.gatewayIp ?? null,
      latencyMs: device.latencyMs ?? null,
      packetLossPercent: device.packetLossPercent ?? null,
      cpuPercent: device.cpuPercent ?? null,
      memory: device.memory
        ? { usedPercent: device.memory.usedPercent, totalMb: device.memory.totalMb ?? null }
        : null,
      disks: device.disks.map((disk) => ({
        name: disk.name,
        usedPercent: disk.usedPercent,
        totalGb: disk.totalGb ?? null,
      })),
      ports: device.ports.map((entry) => ({
        port: entry.port,
        protocol: entry.protocol,
        services: entry.services.map((service) => ({
          name: service.name,
          product: service.product ?? null,
          version: service.version ?? null,
        })),
      })),
      certificates: device.certificates.map((certificate) => ({
        port: certificate.port,
        subject: certificate.subject,
        issuer: certificate.issuer ?? null,
        validFrom: certificate.validFrom ? new Date(certificate.validFrom) : null,
        expiresAt: new Date(certificate.expiresAt),
        valid: certificate.valid ?? null,
        validationError: certificate.validationError ?? null,
      })),
    })),
    throughput: payload.throughput.map((sample) => ({
      sourceIp: sample.sourceIp,
      targetIp: sample.targetIp ?? null,
      mbps: sample.mbps,
    })),
  };
}
