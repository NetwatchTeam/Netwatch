import { describe, expect, it } from 'vitest';
import { createDiscoveredDevice, type Device } from '../../src/domain/entities/device.js';
import { openEvent, type MonitoringEvent } from '../../src/domain/entities/monitoring-event.js';
import { buildWeeklyReport } from '../../src/domain/reporting/weekly-report.js';

const WEEK_START = new Date('2026-09-14T00:00:00Z');
const WEEK_END = new Date('2026-09-21T00:00:00Z');
const MINUTE = 60_000;

function device(id: string, label: string, critical = false): Device {
  return {
    ...createDiscoveredDevice(id, {
      ip: `192.168.1.${id.slice(-1)}`,
      mac: null,
      hostname: label,
      vendor: null,
      gatewayIp: null,
      latencyMs: 1,
      packetLossPercent: 0,
      cpuPercent: null,
      memory: null,
      disks: [],
      ports: [],
      certificates: [],
    }, WEEK_START),
    lifecycle: 'active',
    critical,
  };
}

function outage(id: string, deviceId: string, startMinutes: number, durationMinutes: number): MonitoringEvent {
  const startedAt = new Date(WEEK_START.getTime() + startMinutes * MINUTE);
  return {
    ...openEvent(id, {
      deviceId,
      type: 'device_unreachable',
      severity: 'warning',
      summary: 'ne répond plus',
      dedupeKey: 'device_unreachable',
      startedAt,
    }),
    status: 'resolved',
    resolvedAt: new Date(startedAt.getTime() + durationMinutes * MINUTE),
  };
}

describe('rapport hebdomadaire', () => {
  const devices = [device('dev-1', 'srv-erp', true), device('dev-2', 'pc-compta'), device('dev-3', 'nas')];

  it('classe les pannes par indisponibilité cumulée', () => {
    const report = buildWeeklyReport({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      devices,
      incidents: [
        outage('e1', 'dev-1', 100, 30),
        outage('e2', 'dev-1', 500, 45),
        outage('e3', 'dev-2', 200, 120),
      ],
      eventsInWeek: [],
      openSecurityEvents: [],
      averageThroughputMbps: null,
      previousWeekAvailability: null,
    });

    expect(report.topOutagesByDowntime[0]).toMatchObject({
      deviceName: 'pc-compta',
      downtimeMinutes: 120,
      outageCount: 1,
    });
    expect(report.topOutagesByDowntime[1]).toMatchObject({
      deviceName: 'srv-erp',
      downtimeMinutes: 75,
      outageCount: 2,
      longestOutageMinutes: 45,
    });
    expect(report.devicesImpacted).toBe(2);
    expect(report.totalDowntimeMinutes).toBe(195);
  });

  it('regroupe les pannes simultanées en un seul épisode', () => {
    const report = buildWeeklyReport({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      devices,
      incidents: [
        outage('e1', 'dev-1', 300, 60),
        outage('e2', 'dev-2', 310, 40),
        outage('e3', 'dev-3', 320, 30),
        outage('e4', 'dev-2', 1000, 10),
      ],
      eventsInWeek: [],
      openSecurityEvents: [],
      averageThroughputMbps: null,
      previousWeekAvailability: null,
    });

    const [worst] = report.topOutagesByImpact;
    expect(worst?.devicesImpacted).toBe(3);
    expect(worst?.durationMinutes).toBe(60);
    expect(report.headline).toContain('3 machines en même temps');
  });

  it('signale une coupure encore en cours à la fin de la période', () => {
    const ongoing = { ...outage('e2', 'dev-2', 330, 0), status: 'open' as const, resolvedAt: null };
    const report = buildWeeklyReport({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      devices,
      incidents: [outage('e1', 'dev-1', 300, 60), ongoing, outage('e3', 'dev-3', 100, 10)],
      eventsInWeek: [],
      openSecurityEvents: [],
      averageThroughputMbps: null,
      previousWeekAvailability: null,
    });

    const [widest, isolated] = report.topOutagesByImpact;
    expect(widest).toMatchObject({ devicesImpacted: 2, endedAt: null });
    expect(isolated?.endedAt).toEqual(new Date(WEEK_START.getTime() + 110 * MINUTE));
  });

  it('limite la panne à la semaine analysée', () => {
    const before = {
      ...outage('e1', 'dev-1', 0, 0),
      startedAt: new Date(WEEK_START.getTime() - 600 * MINUTE),
      resolvedAt: new Date(WEEK_START.getTime() + 60 * MINUTE),
    };

    const report = buildWeeklyReport({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      devices,
      incidents: [before],
      eventsInWeek: [],
      openSecurityEvents: [],
      averageThroughputMbps: null,
      previousWeekAvailability: null,
    });

    expect(report.totalDowntimeMinutes).toBe(60);
  });

  it('annonce une semaine sans panne', () => {
    const report = buildWeeklyReport({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      devices,
      incidents: [],
      eventsInWeek: [],
      openSecurityEvents: [],
      averageThroughputMbps: 920,
      previousWeekAvailability: null,
    });

    expect(report.availability).toBe(1);
    expect(report.headline).toContain('Aucune panne');
  });
});
