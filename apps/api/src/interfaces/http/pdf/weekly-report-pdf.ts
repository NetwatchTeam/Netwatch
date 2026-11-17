import PDFDocument from 'pdfkit';
import type { EventCategory, EventSeverity } from '../../../domain/entities/monitoring-event.js';
import type { WeeklyReport } from '../../../domain/reporting/weekly-report.js';

/**
 * Rapport hebdomadaire au format PDF, pour la réunion de direction.
 * Il met en tête ce qui a le plus coûté : les machines restées le plus longtemps
 * hors service, puis les coupures qui ont touché le plus de machines à la fois.
 */

export interface WeeklyReportPdfOptions {
  /** Fuseau d'affichage des heures (ex. `Europe/Paris`). */
  timeZone: string;
  generatedAt: Date;
}

const COLORS = {
  text: '#16202c',
  muted: '#64717f',
  primary: '#1f5fd6',
  border: '#e2e6ec',
  headerBg: '#f4f6f9',
  zebra: '#fafbfc',
  good: '#15803d',
  warning: '#a16207',
  critical: '#b3261e',
};

const PAGE_MARGIN = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORY_LABELS: Record<EventCategory, string> = {
  incident: 'Pannes',
  observation: 'Observations (débit, perte de paquets, saturation)',
  signalement: 'Signalements (ports, certificats)',
  configuration: 'Machines à identifier',
};

const SEVERITY_LABELS: Record<EventSeverity, string> = {
  info: 'Information',
  warning: 'À surveiller',
  critical: 'Critique',
};

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  info: COLORS.primary,
  warning: COLORS.warning,
  critical: COLORS.critical,
};

/**
 * Les polices intégrées aux PDF (Helvetica) ne couvrent que l'encodage Windows-1252.
 * Les espaces insécables fines produites par `Intl` deviennent des espaces simples,
 * et un caractère hors encodage (nom de machine exotique) est remplacé par « ? ».
 */
function pdfText(value: string): string {
  return value
    .replace(/[  ]/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
}

/** Durée en français courant : « 45 min », « 2 h 15 », « 3 j 4 h ». */
function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 1) return 'moins d’1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) return `${hours} h ${String(totalMinutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2).replace('.', ',')} %`;
}

function availabilityColor(ratio: number): string {
  if (ratio >= 0.999) return COLORS.good;
  if (ratio >= 0.99) return COLORS.warning;
  return COLORS.critical;
}

interface Formatters {
  /** Jour de la période. Les semaines sont découpées en UTC : on les affiche en UTC pour ne pas décaler d'un jour. */
  day: (date: Date) => string;
  /** Horodatage d'un événement, dans le fuseau du client. */
  dateTime: (date: Date) => string;
}

function formatters(timeZone: string): Formatters {
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'full' });
  const dateTime = new Intl.DateTimeFormat('fr-FR', { timeZone, dateStyle: 'short', timeStyle: 'short' });
  return { day: (date) => day.format(date), dateTime: (date) => dateTime.format(date) };
}

function periodLabel(report: WeeklyReport, format: Formatters): string {
  const complete = report.weekEnd.getTime() - report.weekStart.getTime() >= WEEK_MS;
  const lastDay = new Date(report.weekEnd.getTime() - 1);
  const label = `Du ${format.day(report.weekStart)} au ${format.day(lastDay)}`;
  return complete ? label : `${label} (semaine en cours)`;
}

export function weeklyReportFileName(report: WeeklyReport): string {
  return `netwatch-rapport-hebdomadaire-${report.weekStart.toISOString().slice(0, 10)}.pdf`;
}

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

interface Cell {
  text: string;
  color?: string;
  bold?: boolean;
}

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

type Doc = PDFKit.PDFDocument;

const CELL_PADDING_X = 6;
const CELL_PADDING_Y = 5;
const TABLE_FONT_SIZE = 9;

function contentWidth(doc: Doc): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function pageBottom(doc: Doc): number {
  return doc.page.height - PAGE_MARGIN;
}

/** Évite un titre seul en bas de page : on change de page s'il reste moins de `needed` points. */
function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > pageBottom(doc)) doc.addPage();
}

function sectionTitle(doc: Doc, title: string): void {
  ensureSpace(doc, 90);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.text).text(pdfText(title), PAGE_MARGIN, doc.y);
  const y = doc.y + 3;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + contentWidth(doc), y)
    .lineWidth(1)
    .strokeColor(COLORS.primary)
    .stroke();
  doc.y = y + 8;
}

function subTitle(doc: Doc, title: string, explanation?: string): void {
  ensureSpace(doc, 70);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text).text(pdfText(title), PAGE_MARGIN, doc.y);
  if (explanation) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(pdfText(explanation), PAGE_MARGIN, doc.y + 2, { width: contentWidth(doc) });
  }
  doc.moveDown(0.5);
}

function paragraph(doc: Doc, text: string, color = COLORS.muted): void {
  doc.font('Helvetica').fontSize(10).fillColor(color).text(pdfText(text), PAGE_MARGIN, doc.y, {
    width: contentWidth(doc),
    lineGap: 2,
  });
  doc.moveDown(0.5);
}

function cellHeight(doc: Doc, cell: Cell, width: number): number {
  doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(TABLE_FONT_SIZE);
  return doc.heightOfString(pdfText(cell.text), { width: width - CELL_PADDING_X * 2 });
}

function drawRow(doc: Doc, columns: Column[], cells: Cell[], y: number, height: number, fill?: string): void {
  if (fill) doc.rect(PAGE_MARGIN, y, contentWidth(doc), height).fill(fill);

  let x = PAGE_MARGIN;
  columns.forEach((column, index) => {
    const cell = cells[index] ?? { text: '' };
    doc
      .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(TABLE_FONT_SIZE)
      .fillColor(cell.color ?? COLORS.text)
      .text(pdfText(cell.text), x + CELL_PADDING_X, y + CELL_PADDING_Y, {
        width: column.width - CELL_PADDING_X * 2,
        align: column.align ?? 'left',
      });
    x += column.width;
  });

  doc
    .moveTo(PAGE_MARGIN, y + height)
    .lineTo(PAGE_MARGIN + contentWidth(doc), y + height)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke();
}

/** Tableau qui se poursuit sur la page suivante, en-tête répété. */
function table(doc: Doc, columns: Column[], rows: Cell[][]): void {
  const headerCells = columns.map((column) => ({ text: column.header, bold: true, color: COLORS.muted }));
  const rowHeight = (cells: Cell[]) =>
    Math.max(...columns.map((column, index) => cellHeight(doc, cells[index] ?? { text: '' }, column.width))) +
    CELL_PADDING_Y * 2;

  // `doc.text` déplace le curseur : on repart toujours du haut de la ligne, pas de là où le texte s'arrête.
  const drawHeader = () => {
    const top = doc.y;
    const height = rowHeight(headerCells);
    drawRow(doc, columns, headerCells, top, height, COLORS.headerBg);
    doc.y = top + height;
  };

  drawHeader();
  rows.forEach((cells, index) => {
    const height = rowHeight(cells);
    if (doc.y + height > pageBottom(doc)) {
      doc.addPage();
      drawHeader();
    }
    const top = doc.y;
    drawRow(doc, columns, cells, top, height, index % 2 === 1 ? COLORS.zebra : undefined);
    doc.y = top + height;
  });

  doc.x = PAGE_MARGIN;
  doc.moveDown(0.8);
}

function keyFigures(doc: Doc, figures: Array<{ value: string; label: string; hint?: string; color?: string }>): void {
  const gap = 10;
  const width = (contentWidth(doc) - gap * (figures.length - 1)) / figures.length;
  const height = 64;
  const top = doc.y;

  figures.forEach((figure, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    doc.roundedRect(x, top, width, height, 4).lineWidth(0.8).strokeColor(COLORS.border).stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(figure.color ?? COLORS.text)
      .text(pdfText(figure.value), x + 8, top + 9, { width: width - 16 });
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(pdfText(figure.label), x + 8, top + 30, { width: width - 16 });
    if (figure.hint) {
      doc.fontSize(7.5).text(pdfText(figure.hint), x + 8, top + 44, { width: width - 16 });
    }
  });

  doc.x = PAGE_MARGIN;
  doc.y = top + height + 6;
}

function header(doc: Doc, report: WeeklyReport, format: Formatters, generatedAt: Date): void {
  const bandHeight = 92;
  doc.rect(0, 0, doc.page.width, bandHeight).fill(COLORS.primary);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text('NETWATCH', PAGE_MARGIN, 22);
  doc.fontSize(20).text(pdfText('Rapport hebdomadaire du réseau'), PAGE_MARGIN, 36);
  doc.font('Helvetica').fontSize(11).text(pdfText(periodLabel(report, format)), PAGE_MARGIN, 62);

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(pdfText(`Généré le ${format.dateTime(generatedAt)}`), PAGE_MARGIN, bandHeight + 10, {
      width: contentWidth(doc),
      align: 'right',
    });
  doc.y = bandHeight + 28;
}

function footers(doc: Doc, report: WeeklyReport, format: Formatters): void {
  const range = doc.bufferedPageRange();
  const label = pdfText(`NetWatch · ${periodLabel(report, format)}`);

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Écrire sous la marge basse déclencherait une nouvelle page : on la lève le temps du pied de page.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - PAGE_MARGIN + 18;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    doc.text(label, PAGE_MARGIN, y, { width: contentWidth(doc) - 60, lineBreak: false });
    doc.text(`Page ${index - range.start + 1} / ${range.count}`, PAGE_MARGIN, y, {
      width: contentWidth(doc),
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = bottomMargin;
  }
}

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

function summarySection(doc: Doc, report: WeeklyReport): void {
  sectionTitle(doc, 'Synthèse');
  paragraph(doc, report.headline, COLORS.text);
  doc.moveDown(0.3);

  keyFigures(doc, [
    {
      value: formatPercent(report.availability),
      label: 'Disponibilité du parc',
      hint:
        report.previousWeekAvailability === null
          ? undefined
          : `Semaine précédente : ${formatPercent(report.previousWeekAvailability)}`,
      color: availabilityColor(report.availability),
    },
    { value: formatMinutes(report.totalDowntimeMinutes), label: 'Indisponibilité cumulée' },
    {
      value: `${report.devicesImpacted} / ${report.devicesMonitored}`,
      label: 'Machines touchées par une panne',
    },
    { value: String(report.newDevices), label: 'Nouvelles machines détectées' },
  ]);
}

function majorIncidentsSection(doc: Doc, report: WeeklyReport, format: Formatters): void {
  sectionTitle(doc, '1. Incidents les plus conséquents');

  if (report.topOutagesByDowntime.length === 0) {
    paragraph(doc, 'Aucune panne n’a été constatée sur la période.');
    return;
  }

  subTitle(
    doc,
    'Machines restées le plus longtemps hors service',
    'Classées par durée cumulée d’indisponibilité sur la période. Les équipements déclarés critiques sont signalés en rouge.',
  );
  table(
    doc,
    [
      { header: 'N°', width: 34, align: 'center' },
      { header: 'Équipement', width: 166 },
      { header: 'Indisponibilité', width: 80, align: 'right' },
      { header: 'Pannes', width: 50, align: 'right' },
      { header: 'Plus longue panne', width: 80, align: 'right' },
      { header: 'Disponibilité', width: 85, align: 'right' },
    ],
    report.topOutagesByDowntime.map((outage, index) => [
      { text: String(index + 1), bold: index === 0 },
      outage.critical
        ? { text: `${outage.deviceName} (critique)`, color: COLORS.critical, bold: true }
        : { text: outage.deviceName, bold: index === 0 },
      { text: formatMinutes(outage.downtimeMinutes), bold: index === 0 },
      { text: String(outage.outageCount) },
      { text: formatMinutes(outage.longestOutageMinutes) },
      { text: formatPercent(outage.availability), color: availabilityColor(outage.availability) },
    ]),
  );

  subTitle(
    doc,
    'Coupures les plus étendues',
    'Pannes survenues en même temps sur plusieurs machines, classées par nombre de machines touchées : ' +
      'souvent le signe d’une cause commune (switch, alimentation, lien opérateur).',
  );
  table(
    doc,
    [
      { header: 'Début', width: 88 },
      { header: 'Fin', width: 88 },
      { header: 'Durée', width: 60, align: 'right' },
      { header: 'Machines', width: 56, align: 'right' },
      { header: 'Équipements touchés', width: 203 },
    ],
    report.topOutagesByImpact.map((episode) => [
      { text: format.dateTime(episode.startedAt) },
      episode.endedAt
        ? { text: format.dateTime(episode.endedAt) }
        : { text: 'En cours', color: COLORS.critical, bold: true },
      { text: formatMinutes(episode.durationMinutes) },
      { text: String(episode.devicesImpacted), bold: episode.devicesImpacted > 1 },
      { text: episode.deviceNames.join(', ') },
    ]),
  );
}

function securitySection(doc: Doc, report: WeeklyReport): void {
  sectionTitle(doc, '2. Points de sécurité à traiter');

  if (report.openSecurityFindings.length === 0) {
    paragraph(doc, 'Aucun point de sécurité en attente à la fin de la période.');
    return;
  }

  const order: Record<EventSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const findings = [...report.openSecurityFindings].sort((a, b) => order[a.severity] - order[b.severity]);

  table(
    doc,
    [
      { header: 'Gravité', width: 75 },
      { header: 'Équipement', width: 120 },
      { header: 'Constat', width: 300 },
    ],
    findings.map((finding) => [
      { text: SEVERITY_LABELS[finding.severity], color: SEVERITY_COLORS[finding.severity], bold: true },
      { text: finding.deviceName },
      { text: finding.summary },
    ]),
  );
}

function activitySection(doc: Doc, report: WeeklyReport): void {
  sectionTitle(doc, '3. Activité de la semaine');

  const rows: Cell[][] = (Object.keys(CATEGORY_LABELS) as EventCategory[]).map((category) => [
    { text: CATEGORY_LABELS[category] },
    { text: String(report.eventsByCategory[category]) },
  ]);
  if (report.averageThroughputMbps !== null) {
    const mbps = report.averageThroughputMbps;
    rows.push([
      { text: 'Débit moyen mesuré' },
      { text: mbps >= 1000 ? `${(mbps / 1000).toFixed(2).replace('.', ',')} Gbit/s` : `${Math.round(mbps)} Mbit/s` },
    ]);
  }

  table(
    doc,
    [
      { header: 'Événements ouverts pendant la période', width: 395 },
      { header: 'Nombre', width: 100, align: 'right' },
    ],
    rows,
  );
}

export function renderWeeklyReportPdf(report: WeeklyReport, options: WeeklyReportPdfOptions): Promise<Buffer> {
  const format = formatters(options.timeZone);
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    lang: 'fr-FR',
    info: {
      Title: pdfText(`NetWatch — Rapport hebdomadaire — ${periodLabel(report, format)}`),
      Author: 'NetWatch',
      CreationDate: options.generatedAt,
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  header(doc, report, format, options.generatedAt);
  summarySection(doc, report);
  majorIncidentsSection(doc, report, format);
  securitySection(doc, report);
  activitySection(doc, report);
  footers(doc, report, format);

  doc.end();
  return done;
}
