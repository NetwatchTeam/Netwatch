import type {
  CertificateStatus,
  DependencyDto,
  DependencyGraphDto,
  DeviceDecisionDto,
  DeviceDto,
  DeviceLinkDto,
  DuplicateDeviceDetails,
  EventDto,
  MonitoringSettingsDto,
  NetworkSummaryDto,
  ScanRunDto,
  ThroughputPointDto,
  WeeklyReportDto,
} from '@netwatch/contracts';
import { deviceDisplayName, type Device, type TlsCertificate } from '../../domain/entities/device.js';
import { isUsedByCorrelation, type Dependency } from '../../domain/entities/dependency.js';
import type { DeviceDecision } from '../../domain/entities/device-decision.js';
import type { ScanRun, ThroughputSample } from '../../domain/entities/measurement.js';
import type { DependencyIssue } from '../../domain/rules/dependency-graph.js';
import { eventDurationSeconds, type MonitoringEvent } from '../../domain/entities/monitoring-event.js';
import type { MonitoringPolicy } from '../../domain/policy.js';
import type { WeeklyReport } from '../../domain/reporting/weekly-report.js';
import type { NetworkSummary } from '../../application/use-cases/get-network-summary.js';
import { daysBeforeExpiry } from '../../domain/rules/tls-expiry.js';

/**
 * Traduction du domaine vers le contrat HTTP.
 * Le domaine manipule des `Date` ; l'extérieur ne voit que des chaînes ISO.
 */
export function certificateStatus(certificate: TlsCertificate, now: Date): CertificateStatus {
  if (certificate.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (certificate.valid === false) return 'invalid';
  if (certificate.valid === true) return 'valid';
  return 'unverified';
}

export function toDeviceLinkDto(device: Device): DeviceLinkDto {
  return { id: device.id, name: deviceDisplayName(device), reachability: device.reachability };
}

export function toDependencyDto(dependency: Dependency, devices: Map<string, Device>): DependencyDto {
  const link = (id: string) => {
    const device = devices.get(id);
    return device ? toDeviceLinkDto(device) : { id, name: id, reachability: 'unknown' as const };
  };
  return {
    id: dependency.id,
    device: link(dependency.deviceId),
    dependsOn: link(dependency.dependsOnId),
    source: dependency.source,
    status: dependency.status,
    usedByCorrelation: isUsedByCorrelation(dependency),
    createdAt: dependency.createdAt.toISOString(),
    updatedAt: dependency.updatedAt.toISOString(),
    observedAt: dependency.observedAt?.toISOString() ?? null,
  };
}

export function toDependencyGraphDto(
  dependencies: Dependency[],
  issues: DependencyIssue[],
  devices: Device[],
): DependencyGraphDto {
  const byId = new Map(devices.map((device) => [device.id, device]));
  const counts = { suggested: 0, validated: 0, rejected: 0 };
  for (const dependency of dependencies) counts[dependency.status] += 1;
  return {
    dependencies: dependencies.map((dependency) => toDependencyDto(dependency, byId)),
    issues: issues.map((issue) => ({ ...issue })),
    counts,
  };
}

export function toDeviceDto(
  device: Device,
  openEvents: number,
  now: Date,
  gateway: Device | null = null,
): DeviceDto {
  return {
    id: device.id,
    ip: device.ip,
    mac: device.mac,
    hostname: device.hostname,
    vendor: device.vendor,
    kind: device.kind,
    label: device.label,
    critical: device.critical,
    lifecycle: device.lifecycle,
    origin: device.origin,
    reachability: device.reachability,
    gatewayIp: device.gatewayIp,
    gateway: gateway ? toDeviceLinkDto(gateway) : null,
    latencyMs: device.latencyMs,
    packetLossPercent: device.packetLossPercent,
    cpuPercent: device.cpuPercent,
    memory: device.memory,
    disks: device.disks,
    ports: device.ports,
    certificates: device.certificates.map((certificate) => ({
      port: certificate.port,
      subject: certificate.subject,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom?.toISOString() ?? null,
      expiresAt: certificate.expiresAt.toISOString(),
      daysBeforeExpiry: daysBeforeExpiry(certificate.expiresAt, now),
      valid: certificate.valid,
      validationError: certificate.validationError,
      status: certificateStatus(certificate, now),
    })),
    firstSeenAt: device.firstSeenAt.toISOString(),
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastChangeAt: device.lastChangeAt.toISOString(),
    openEvents,
  };
}

export function toDeviceDecisionDto(decision: DeviceDecision): DeviceDecisionDto {
  return {
    id: decision.id,
    deviceId: decision.deviceId,
    action: decision.action,
    author: decision.author,
    decidedAt: decision.decidedAt.toISOString(),
    previousLifecycle: decision.previousLifecycle,
    lifecycle: decision.lifecycle,
    kind: decision.kind,
    label: decision.label,
    critical: decision.critical,
  };
}

export function toDuplicateDeviceDetails(existing: Device, matchedOn: Array<'ip' | 'mac'>): DuplicateDeviceDetails {
  return {
    existing: {
      ...toDeviceLinkDto(existing),
      ip: existing.ip,
      mac: existing.mac,
      lifecycle: existing.lifecycle,
      origin: existing.origin,
    },
    matchedOn,
  };
}

export function toEventDto(
  event: MonitoringEvent,
  names: Map<string, string>,
  now: Date,
): EventDto {
  return {
    id: event.id,
    deviceId: event.deviceId,
    deviceName: names.get(event.deviceId) ?? event.deviceId,
    peerDeviceId: event.peerDeviceId,
    peerDeviceName: event.peerDeviceId ? (names.get(event.peerDeviceId) ?? null) : null,
    type: event.type,
    category: event.category,
    severity: event.severity,
    status: event.status,
    summary: event.summary,
    details: event.details,
    startedAt: event.startedAt.toISOString(),
    resolvedAt: event.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: event.acknowledgedAt?.toISOString() ?? null,
    durationSeconds: eventDurationSeconds(event, now),
  };
}

export function toSummaryDto(summary: NetworkSummary): NetworkSummaryDto {
  return {
    health: summary.health,
    devices: summary.devices,
    openEvents: summary.openEvents,
    availability7d: summary.availability7d,
    averageThroughputMbps: summary.averageThroughputMbps,
    lastScanAt: summary.lastScanAt?.toISOString() ?? null,
    scannerStale: summary.scannerStale,
  };
}

export function toWeeklyReportDto(report: WeeklyReport): WeeklyReportDto {
  return {
    weekStart: report.weekStart.toISOString(),
    weekEnd: report.weekEnd.toISOString(),
    headline: report.headline,
    devicesMonitored: report.devicesMonitored,
    devicesImpacted: report.devicesImpacted,
    totalDowntimeMinutes: report.totalDowntimeMinutes,
    availability: report.availability,
    topOutagesByDowntime: report.topOutagesByDowntime,
    topOutagesByImpact: report.topOutagesByImpact.map((episode) => ({
      startedAt: episode.startedAt.toISOString(),
      endedAt: episode.endedAt?.toISOString() ?? null,
      devicesImpacted: episode.devicesImpacted,
      deviceNames: episode.deviceNames,
      durationMinutes: episode.durationMinutes,
    })),
    eventsByCategory: report.eventsByCategory,
    newDevices: report.newDevices,
    openSecurityFindings: report.openSecurityFindings,
    averageThroughputMbps: report.averageThroughputMbps,
    previousWeekAvailability: report.previousWeekAvailability,
  };
}

export function toThroughputDto(sample: ThroughputSample): ThroughputPointDto {
  return {
    measuredAt: sample.measuredAt.toISOString(),
    mbps: sample.mbps,
    sourceDeviceId: sample.sourceDeviceId,
    targetDeviceId: sample.targetDeviceId,
  };
}

export function toScanRunDto(run: ScanRun): ScanRunDto {
  return {
    id: run.id,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    status: run.status,
    devicesSeen: run.devicesSeen,
    eventsRaised: run.eventsRaised,
    error: run.error,
  };
}

export function toSettingsDto(policy: MonitoringPolicy): MonitoringSettingsDto {
  return { ...policy };
}

export function deviceNameIndex(devices: Device[]): Map<string, string> {
  return new Map(devices.map((device) => [device.id, deviceDisplayName(device)]));
}
