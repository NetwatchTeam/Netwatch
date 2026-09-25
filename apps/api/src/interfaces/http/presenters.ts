import type {
  DeviceDto,
  EventDto,
  MonitoringSettingsDto,
  NetworkSummaryDto,
  ScanRunDto,
  ThroughputPointDto,
  WeeklyReportDto,
} from '@netwatch/contracts';
import { deviceDisplayName, type Device } from '../../domain/entities/device.js';
import type { ScanRun, ThroughputSample } from '../../domain/entities/measurement.js';
import { eventDurationSeconds, type MonitoringEvent } from '../../domain/entities/monitoring-event.js';
import type { MonitoringPolicy } from '../../domain/policy.js';
import type { WeeklyReport } from '../../domain/reporting/weekly-report.js';
import type { NetworkSummary } from '../../application/use-cases/get-network-summary.js';
import { daysBeforeExpiry } from '../../domain/rules/tls-expiry.js';

/**
 * Traduction du domaine vers le contrat HTTP.
 * Le domaine manipule des `Date` ; l'extérieur ne voit que des chaînes ISO.
 */
export function toDeviceDto(device: Device, openEvents: number, now: Date): DeviceDto {
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
    reachability: device.reachability,
    latencyMs: device.latencyMs,
    openPorts: device.openPorts,
    certificates: device.certificates.map((certificate) => ({
      port: certificate.port,
      subject: certificate.subject,
      issuer: certificate.issuer,
      expiresAt: certificate.expiresAt.toISOString(),
      daysBeforeExpiry: daysBeforeExpiry(certificate.expiresAt, now),
    })),
    firstSeenAt: device.firstSeenAt.toISOString(),
    lastSeenAt: device.lastSeenAt.toISOString(),
    lastChangeAt: device.lastChangeAt.toISOString(),
    openEvents,
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
