import { describe, expect, it } from 'vitest';
import type { WeeklyReport } from '../../src/domain/reporting/weekly-report.js';
import { renderWeeklyReportPdf, weeklyReportFileName } from '../../src/interfaces/http/pdf/weekly-report-pdf.js';

const WEEK_START = new Date('2026-09-14T00:00:00Z');
const OPTIONS = { timeZone: 'Europe/Paris', generatedAt: new Date('2026-09-21T07:30:00Z') };

function report(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    weekStart: WEEK_START,
    weekEnd: new Date('2026-09-21T00:00:00Z'),
    headline: 'Aucune panne cette semaine sur les 12 équipements surveillés.',
    devicesMonitored: 12,
    devicesImpacted: 0,
    totalDowntimeMinutes: 0,
    availability: 1,
    topOutagesByDowntime: [],
    topOutagesByImpact: [],
    eventsByCategory: { incident: 0, observation: 0, signalement: 0, configuration: 0 },
    newDevices: 0,
    openSecurityFindings: [],
    averageThroughputMbps: null,
    previousWeekAvailability: null,
    ...overrides,
  };
}

/** Nombre de pages : chaque page du document est un objet `/Type /Page`. */
function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

function expectValidPdf(pdf: Buffer): void {
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.subarray(-6).toString()).toContain('%%EOF');
}

describe('rapport hebdomadaire en PDF', () => {
  it('produit un document d’une page pour une semaine sans panne', async () => {
    const pdf = await renderWeeklyReportPdf(report(), OPTIONS);
    expectValidPdf(pdf);
    expect(pageCount(pdf)).toBe(1);
  });

  it('poursuit les tableaux sur plusieurs pages et accepte les noms hors alphabet latin', async () => {
    const outages = Array.from({ length: 10 }, (_, index) => ({
      deviceId: `dev-${index}`,
      deviceName: index === 0 ? 'serveur-東京 ✓' : `machine-${index}`,
      critical: index % 3 === 0,
      outageCount: 10 - index,
      downtimeMinutes: 600 - index * 50,
      longestOutageMinutes: 120,
      availability: 0.95,
    }));
    const episodes = Array.from({ length: 5 }, (_, index) => ({
      startedAt: new Date(WEEK_START.getTime() + index * 3_600_000),
      endedAt: index === 0 ? null : new Date(WEEK_START.getTime() + index * 3_600_000 + 1_800_000),
      devicesImpacted: 8 - index,
      deviceNames: Array.from({ length: 8 - index }, (_, n) => `poste-comptabilite-${n}`),
      durationMinutes: 30,
    }));
    const findings = Array.from({ length: 30 }, (_, index) => ({
      deviceName: `srv-${index}`,
      summary: `Le certificat de sécurité de srv-${index} (port 443) expire dans ${index} jour(s)`,
      severity: index % 2 === 0 ? ('critical' as const) : ('warning' as const),
    }));

    const pdf = await renderWeeklyReportPdf(
      report({
        devicesImpacted: 10,
        totalDowntimeMinutes: 3_750,
        availability: 0.9627,
        previousWeekAvailability: 0.998,
        topOutagesByDowntime: outages,
        topOutagesByImpact: episodes,
        openSecurityFindings: findings,
        averageThroughputMbps: 1_250,
        eventsByCategory: { incident: 22, observation: 7, signalement: 30, configuration: 2 },
      }),
      OPTIONS,
    );

    expectValidPdf(pdf);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it('nomme le fichier d’après le lundi de la semaine', () => {
    expect(weeklyReportFileName(report())).toBe('netwatch-rapport-hebdomadaire-2026-09-14.pdf');
  });
});
