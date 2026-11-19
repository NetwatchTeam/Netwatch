// Génère les maquettes fil de fer du dashboard (docs/squelette/*.svg).
//
//   node tools/squelette/generer-maquettes.mjs
//
// Chaque maquette reproduit la disposition réelle d'une page de apps/web/src/pages, avec des zones
// numérotées décrites dans docs/squelette-application.md. À relancer quand une page change.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../docs/squelette');

const W = 1100;
const SIDEBAR = 190;
const X = 214; // début de la zone de contenu
const CW = W - X - 24; // largeur du contenu
const GAP = 18;

const C = {
  text: '#1e293b',
  muted: '#64748b',
  line: '#cbd5e1',
  fill: '#f1f5f9',
  bar: '#e2e8f0',
  side: '#334155',
  sideText: '#cbd5e1',
  accent: '#1f5fd6',
  accentSoft: '#eaf1fe',
  warn: '#a16207',
  warnSoft: '#fef3c7',
  bad: '#b3261e',
  badSoft: '#fde8e6',
  good: '#15803d',
  goodSoft: '#dcfce7',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textW = (label, size = 12) => label.length * size * 0.56;

const t = (x, y, label, { size = 12, color = C.text, weight = 400, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${esc(label)}</text>`;
const rect = (x, y, w, h, { fill = '#fff', stroke = C.line, rx = 6, dash = '' } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const bar = (x, y, w, h = 8, fill = C.bar) => `<rect x="${x}" y="${y}" width="${Math.max(10, w)}" height="${h}" rx="${h / 2}" fill="${fill}"/>`;

/** Repère numéroté d'une zone, renvoyant au tableau du document. */
const marker = (n, x, y) =>
  `<g><circle cx="${x}" cy="${y}" r="11" fill="${C.accent}"/>${t(x, y + 4, String(n), { size: 12, color: '#fff', weight: 700, anchor: 'middle' })}</g>`;

function button(x, y, label, { primary = false, small = false } = {}) {
  const h = small ? 24 : 30;
  const size = small ? 10.5 : 12;
  const w = textW(label, size) + (small ? 16 : 26);
  return {
    w,
    svg:
      rect(x, y, w, h, { fill: primary ? C.accent : '#fff', stroke: primary ? C.accent : C.line, rx: 5 }) +
      t(x + w / 2, y + h / 2 + size / 2.8, label, { size, color: primary ? '#fff' : C.text, anchor: 'middle', weight: primary ? 600 : 400 }),
  };
}

/** Boutons alignés à droite, se terminant en `right`. */
function buttonsRight(right, y, labels) {
  let x = right;
  let svg = '';
  for (const [label, opts] of [...labels].reverse()) {
    const b = button(0, 0, label, opts);
    x -= b.w;
    svg += button(x, y, label, opts).svg;
    x -= 8;
  }
  return svg;
}

function buttonsLeft(x, y, labels) {
  let svg = '';
  for (const [label, opts] of labels) {
    const b = button(x, y, label, opts);
    svg += b.svg;
    x += b.w + 8;
  }
  return { svg, end: x };
}

const badge = (x, y, label, tone = 'neutral') => {
  const tones = {
    neutral: [C.fill, C.muted],
    bad: [C.badSoft, C.bad],
    warn: [C.warnSoft, C.warn],
    good: [C.goodSoft, C.good],
    info: [C.accentSoft, C.accent],
  };
  const [fill, color] = tones[tone];
  const w = textW(label, 10.5) + 16;
  return { w, svg: rect(x, y, w, 20, { fill, stroke: fill, rx: 10 }) + t(x + w / 2, y + 14, label, { size: 10.5, color, anchor: 'middle', weight: 600 }) };
};

function select(x, y, w, label) {
  return rect(x, y, w, 30, { rx: 5 }) + t(x + 10, y + 19, label, { size: 11.5, color: C.muted }) + t(x + w - 14, y + 19, '▾', { size: 11, color: C.muted });
}

function input(x, y, w, placeholder) {
  return rect(x, y, w, 30, { rx: 5 }) + t(x + 10, y + 19, placeholder, { size: 11.5, color: '#94a3b8' });
}

function panel(x, y, w, h, title, { link } = {}) {
  let svg = rect(x, y, w, h, { rx: 8 });
  if (title) svg += t(x + 16, y + 26, title, { size: 14, weight: 700 });
  if (link) svg += t(x + w - 16, y + 26, link, { size: 11.5, color: C.accent, anchor: 'end' });
  return svg;
}

function statCard(x, y, w, label, value, tone) {
  const border = { bad: C.bad, warn: C.warn, good: C.good }[tone] ?? C.line;
  return (
    rect(x, y, w, 84, { rx: 8 }) +
    `<rect x="${x}" y="${y + 6}" width="4" height="72" rx="2" fill="${border}"/>` +
    t(x + 16, y + 38, value, { size: 20, weight: 700 }) +
    t(x + 16, y + 62, label, { size: 11, color: C.muted })
  );
}

/** Tableau : colonnes [libellé, poids]. Renvoie { svg, h }. */
function table(x, y, w, cols, rows, { cells } = {}) {
  const total = cols.reduce((sum, [, weight]) => sum + weight, 0);
  const widths = cols.map(([, weight]) => (w * weight) / total);
  let svg = rect(x, y, w, 30, { fill: C.fill, stroke: C.fill, rx: 4 });
  let cx = x;
  cols.forEach(([label], i) => {
    svg += t(cx + 10, y + 19, label, { size: 10.5, color: C.muted, weight: 700 });
    cx += widths[i];
  });
  for (let r = 0; r < rows; r += 1) {
    const ry = y + 30 + r * 32;
    svg += `<line x1="${x}" y1="${ry + 32}" x2="${x + w}" y2="${ry + 32}" stroke="${C.bar}"/>`;
    cx = x;
    widths.forEach((cw, i) => {
      const custom = cells?.(r, i, cx + 10, ry + 8, cw - 20);
      svg += custom ?? bar(cx + 10, ry + 12, (cw - 20) * (0.45 + ((r * 7 + i * 3) % 5) / 10));
      cx += cw;
    });
  }
  return { svg, h: 30 + rows * 32 };
}

/** Liste d'événements (EventList) : familles, résumé, équipement, état, action. */
function eventList(x, y, w, rows, { actions = false, details = false } = {}) {
  let svg = '';
  const rowH = details ? 70 : 52;
  const tones = [['Panne', 'bad'], ['Signalement', 'warn'], ['Observation', 'info']];
  for (let r = 0; r < rows; r += 1) {
    const ry = y + r * rowH;
    const [label, tone] = tones[r % tones.length];
    const b1 = badge(x, ry + 6, label, tone);
    svg += b1.svg + badge(x, ry + 30, r % 2 ? 'À surveiller' : 'Critique', r % 2 ? 'warn' : 'bad').svg;
    svg += bar(x + 120, ry + 10, w * 0.42, 9, '#cbd5e1');
    svg += bar(x + 120, ry + 28, w * 0.22);
    if (details) svg += bar(x + 120, ry + 46, w * 0.3, 7) + bar(x + 120 + w * 0.32, ry + 46, w * 0.12, 7);
    const status = r === 1 ? 'Pris en charge' : 'Ouvert';
    const action = button(0, 0, r === 1 ? 'Retirer la prise en charge' : 'Prendre en charge', { small: true });
    const statusW = badge(0, 0, status).w;
    const statusX = x + w - statusW - (actions ? action.w + 10 : 0);
    svg += badge(statusX, ry + 16, status, 'neutral').svg;
    if (actions) svg += button(x + w - action.w, ry + 14, r === 1 ? 'Retirer la prise en charge' : 'Prendre en charge', { small: true }).svg;
    svg += `<line x1="${x}" y1="${ry + rowH - 4}" x2="${x + w}" y2="${ry + rowH - 4}" stroke="${C.bar}"/>`;
  }
  return { svg, h: rows * rowH };
}

/** Paires libellé / valeur (liste de définitions). */
function details(x, y, w, labels, { columns = 2 } = {}) {
  let svg = '';
  const colW = w / columns;
  labels.forEach((label, i) => {
    const cx = x + (i % columns) * colW;
    const cy = y + Math.floor(i / columns) * 42;
    svg += t(cx, cy + 12, label, { size: 10.5, color: C.muted }) + bar(cx, cy + 20, colW * 0.6, 9, '#cbd5e1');
  });
  return { svg, h: Math.ceil(labels.length / columns) * 42 };
}

const usage = (x, y, w, label) =>
  t(x, y + 11, label, { size: 10.5, color: C.muted }) +
  bar(x + 120, y + 4, w - 180, 8) +
  bar(x + 120, y + 4, (w - 180) * 0.7, 8, '#94a3b8') +
  t(x + w - 50, y + 12, '70 %', { size: 10.5, weight: 600 });

// ---------------------------------------------------------------------------
// Gabarit commun : menu latéral + en-tête de page
// ---------------------------------------------------------------------------

const NAV = [
  ['DIRECTION', [['overview', 'Vue d’ensemble'], ['report', 'Rapport hebdomadaire']]],
  [
    'TECHNIQUE',
    [
      ['devices', 'Équipements'],
      ['events', 'Événements'],
      ['pending', 'À valider'],
      ['dependencies', 'Dépendances'],
      ['scans', 'Scans'],
      ['settings', 'Réglages'],
    ],
  ],
];

function sidebar(active, h) {
  let svg = `<rect x="0" y="0" width="${SIDEBAR}" height="${h}" fill="${C.side}"/>`;
  svg += t(20, 36, 'NetWatch', { size: 17, color: '#fff', weight: 700 });
  let y = 70;
  for (const [title, items] of NAV) {
    svg += t(20, y, title, { size: 10, color: '#94a3b8', weight: 700 });
    y += 12;
    for (const [key, label] of items) {
      if (key === active) svg += `<rect x="10" y="${y}" width="${SIDEBAR - 20}" height="28" rx="5" fill="#64748b"/>`;
      svg += t(20, y + 18, label, { size: 12, color: key === active ? '#fff' : C.sideText, weight: key === active ? 600 : 400 });
      y += 32;
    }
    y += 16;
  }
  return svg;
}

function pageHeader(y, title, subtitle, actions = []) {
  let svg = t(X, y + 24, title, { size: 22, weight: 700 });
  if (subtitle) svg += t(X, y + 46, subtitle, { size: 12, color: C.muted });
  if (actions.length > 0) svg += buttonsRight(X + CW, y + 6, actions);
  const actionsWidth = actions.reduce((sum, [label, opts]) => sum + button(0, 0, label, opts).w + 8, -8);
  return { svg, h: subtitle ? 62 : 40, actionsX: X + CW - actionsWidth };
}

function page(file, label, active, minHeight, draw) {
  let body = '';
  const add = (svg) => (body += svg);
  draw(add);
  const bottoms = [...body.matchAll(/<rect x="[^"]*" y="([\d.]+)" width="[^"]*" height="([\d.]+)"/g)].map((m) => Number(m[1]) + Number(m[2]));
  const height = Math.max(Math.ceil(Math.max(...bottoms) + 30), minHeight);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(label)}" font-family="Segoe UI, system-ui, sans-serif">\n` +
    `<rect width="${W}" height="${height}" fill="#f8fafc"/>\n` +
    sidebar(active, height) +
    body +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" fill="none" stroke="${C.line}"/>\n</svg>\n`;
  writeFileSync(join(OUT, file), svg, 'utf8');
  return file;
}

const half = (CW - 16) / 2;

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const written = [];

written.push(page('01-vue-ensemble.svg', 'Maquette : vue d’ensemble', 'overview', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Vue d’ensemble', 'Dernière vérification il y a 2 minutes');
  add(head.svg);
  y += head.h + 12;

  add(rect(X, y, CW, 56, { fill: C.badSoft, stroke: C.bad, rx: 8 }));
  add(t(X + 16, y + 24, 'Une panne est en cours sur votre réseau.', { size: 13, weight: 700, color: C.bad }));
  add(t(X + 16, y + 42, 'Attention : le scanner n’a pas envoyé de résultat récemment… (si les données sont anciennes)', { size: 11, color: C.bad }));
  add(marker(1, X, y));
  y += 56 + GAP;

  const cards = [
    ['Équipements suivis', '38'],
    ['En panne', '1', 'bad'],
    ['Injoignables', '8', 'warn'],
    ['Disponibilité (7 jours)', '99,98 %', 'good'],
    ['Débit moyen (24 h)', '848 Mbit/s'],
    ['Points de sécurité', '9', 'warn'],
    ['Équipements à valider', '35', 'warn'],
  ];
  const cardW = (CW - 3 * 12) / 4;
  cards.forEach(([label, value, tone], i) => {
    add(statCard(X + (i % 4) * (cardW + 12), y + Math.floor(i / 4) * 96, cardW, label, value, tone));
  });
  add(marker(2, X, y));
  y += 2 * 96 - 12 + GAP;

  add(panel(X, y, CW, 230, 'Pannes en cours', { link: 'Tout l’historique' }));
  add(eventList(X + 16, y + 44, CW - 32, 3).svg);
  add(marker(3, X, y));
  y += 230 + GAP;

  add(panel(X, y, CW, 200, 'Évolution de la vitesse du réseau', { link: 'Rapport hebdomadaire' }));
  const cx = X + 40;
  const cy = y + 170;
  add(`<line x1="${cx}" y1="${y + 50}" x2="${cx}" y2="${cy}" stroke="${C.line}"/><line x1="${cx}" y1="${cy}" x2="${X + CW - 20}" y2="${cy}" stroke="${C.line}"/>`);
  const pts = Array.from({ length: 24 }, (_, i) => `${cx + 10 + i * ((CW - 80) / 23)},${cy - 40 - ((i * 37) % 70) - (i === 15 ? -30 : 0)}`).join(' ');
  add(`<polyline points="${pts}" fill="none" stroke="${C.accent}" stroke-width="2"/>`);
  add(marker(4, X, y));
}));

written.push(page('02-rapport-hebdomadaire.svg', 'Maquette : rapport hebdomadaire', 'report', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Rapport hebdomadaire', 'Du lundi 2 novembre au dimanche 8 novembre 2026', [
    ['Exporter en PDF', { primary: true }],
    ['Semaine précédente', {}],
    ['Semaine suivante', {}],
  ]);
  add(head.svg);
  add(marker(1, head.actionsX - 16, y + 21));
  y += head.h + 12;

  add(panel(X, y, CW, 70));
  add(bar(X + 16, y + 20, CW * 0.85, 9, '#cbd5e1') + bar(X + 16, y + 40, CW * 0.6, 9, '#cbd5e1'));
  add(marker(2, X, y));
  y += 70 + GAP;

  const cardW = (CW - 36) / 4;
  [['Disponibilité du parc', '99,27 %', 'good'], ['Indisponibilité cumulée', '6 j 6 h'], ['Machines touchées', '5 / 38', 'bad'], ['Nouvelles machines détectées', '2']].forEach(
    ([label, value, tone], i) => add(statCard(X + i * (cardW + 12), y, cardW, label, value, tone)),
  );
  add(marker(3, X, y));
  y += 84 + GAP;

  const t1 = table(X + 16, y + 44, CW - 32, [['Équipement', 3], ['Indisponibilité', 2], ['Nombre de pannes', 2], ['Panne la plus longue', 2], ['Disponibilité', 2]], 5);
  add(panel(X, y, CW, t1.h + 60, 'Pannes les plus longues') + t1.svg);
  add(marker(4, X, y));
  y += t1.h + 60 + GAP;

  add(panel(X, y, CW, 150, 'Coupures les plus étendues'));
  add(t(X + 16, y + 46, 'Pannes survenues en même temps sur plusieurs machines : souvent le signe d’une cause commune…', { size: 11, color: C.muted }));
  for (let i = 0; i < 3; i += 1) add(bar(X + 30, y + 70 + i * 24, CW * (0.7 - i * 0.12), 9, '#cbd5e1'));
  add(marker(5, X, y));
  y += 150 + GAP;

  add(panel(X, y, half, 200, 'Événements de la semaine'));
  add(details(X + 16, y + 44, half - 32, ['Panne', 'Observation', 'Signalement', 'À configurer']).svg);
  add(panel(X + half + 16, y, half, 200, 'Points de sécurité à traiter'));
  for (let i = 0; i < 4; i += 1) {
    add(badge(X + half + 32, y + 46 + i * 36, i === 0 ? 'Critique' : 'À surveiller', i === 0 ? 'bad' : 'warn').svg);
    add(bar(X + half + 132, y + 52 + i * 36, half - 170, 9, '#cbd5e1'));
  }
  add(marker(6, X, y));
}));

written.push(page('03-equipements.svg', 'Maquette : liste des équipements', 'devices', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Équipements', '38 équipement(s)');
  add(head.svg);
  y += head.h + 12;

  add(input(X, y, 300, 'Nom, IP, MAC, fabricant…') + select(X + 312, y, 180, 'Tous les états') + select(X + 504, y, 180, 'Tous les types'));
  add(marker(1, X, y));
  y += 30 + GAP;

  const cols = [['État', 1.1], ['Équipement', 2.2], ['Adresse IP', 1.4], ['Type', 1.3], ['Latence', 0.9], ['Perte', 0.8], ['CPU', 0.8], ['Mémoire', 0.9], ['Disque', 0.8], ['Alertes', 0.8], ['Vu', 1]];
  const states = [['En ligne', 'good'], ['Hors ligne', 'bad'], ['Injoignable', 'warn'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good'], ['En ligne', 'good']];
  const tb = table(X + 16, y + 16, CW - 32, cols, 12, {
    cells: (r, c, cx, cy, cw) => {
      if (c === 0) return badge(cx, cy + 2, states[r][0], states[r][1]).svg;
      if (c === 1) return bar(cx, cy + 4, cw * 0.7, 9, '#93b4ee') + (r === 1 ? badge(cx + cw * 0.72, cy + 2, 'Critique', 'neutral').svg : '');
      return undefined;
    },
  });
  add(panel(X, y, CW, tb.h + 32) + tb.svg);
  add(marker(2, X, y));
}));

written.push(page('04-fiche-equipement.svg', 'Maquette : fiche d’un équipement', 'devices', 520, (add) => {
  let y = 20;
  add(t(X, y + 12, '← Retour aux équipements', { size: 12, color: C.accent }));
  y += 22;
  const head = pageHeader(y, 'Passerelle atelier', 'Routeur · vu il y a 2 minutes');
  add(head.svg);
  add(badge(X + CW - 190, y + 10, 'Hors ligne', 'bad').svg + badge(X + CW - 100, y + 10, 'Validé', 'good').svg);
  add(marker(1, X + CW - 200, y + 6));
  y += head.h + 12;

  const tech = details(X + 16, y + 44, half - 32, ['Adresse IP', 'Adresse MAC', 'Nom réseau', 'Fabricant', 'Passerelle', 'Première détection', 'Dernier changement d’état']);
  const topH = Math.max(tech.h + 60, 256);
  add(panel(X, y, half, topH, 'Fiche technique') + tech.svg);
  add(panel(X + half + 16, y, half, topH, 'Identification'));
  add(t(X + half + 32, y + 46, 'Le type et le nom métier servent dans tous les rapports.', { size: 11, color: C.muted }));
  add(t(X + half + 32, y + 72, 'Type', { size: 10.5, color: C.muted }) + select(X + half + 32, y + 78, half - 64, 'Routeur'));
  add(t(X + half + 32, y + 126, 'Nom métier', { size: 10.5, color: C.muted }) + input(X + half + 32, y + 132, half - 64, 'Passerelle atelier'));
  add(rect(X + half + 32, y + 178, 14, 14, { rx: 3 }) + t(X + half + 54, y + 190, 'Équipement critique pour l’activité', { size: 11.5 }));
  add(buttonsLeft(X + half + 32, y + 206, [['Enregistrer', { primary: true }], ['Ignorer', {}], ['Exclure du parc', {}]]).svg);
  add(marker(2, X, y));
  y += topH + GAP;

  add(panel(X, y, CW, 130, 'Machines derrière cette passerelle (8)'));
  add(t(X + 16, y + 46, 'La passerelle est en panne : les machines ci-dessous sont coupées du réseau.', { size: 11, color: C.muted }));
  for (let i = 0; i < 8; i += 1) {
    const cx = X + 16 + (i % 4) * ((CW - 32) / 4);
    const cy = y + 62 + Math.floor(i / 4) * 30;
    add(badge(cx, cy, 'Injoignable', 'warn').svg + bar(cx + 92, cy + 6, 90, 9, '#93b4ee'));
  }
  add(t(X + CW - 16, y + 26, 'uniquement pour une passerelle', { size: 10.5, color: C.muted, anchor: 'end' }));
  add(marker(3, X, y));
  y += 130 + GAP;

  add(panel(X, y, half, 322, 'État de la machine'));
  add(details(X + 16, y + 44, half - 32, ['Latence', 'Perte de paquets']).svg);
  add(usage(X + 16, y + 100, half - 32, 'Charge processeur') + usage(X + 16, y + 126, half - 32, 'Mémoire'));
  add(t(X + 16, y + 168, 'Disques', { size: 12, weight: 700 }));
  add(table(X + 16, y + 178, half - 32, [['Disque', 1], ['Occupation', 2.4], ['Capacité', 1]], 3).svg);
  add(panel(X + half + 16, y, half, 322, 'Ports et services'));
  add(table(X + half + 32, y + 44, half - 32, [['Port', 0.8], ['Protocole', 1], ['Service(s)', 3]], 6).svg);
  add(marker(4, X, y));
  y += 322 + GAP;

  const certs = table(X + 16, y + 44, CW - 32, [['Port', 0.7], ['Sujet', 2.2], ['Émetteur', 2], ['Valide depuis', 1.6], ['Expire le', 1.6], ['Jours restants', 1.2], ['Validation', 1.6]], 2, {
    cells: (r, c, cx, cy) => (c === 6 ? badge(cx, cy + 2, r === 0 ? 'Valide' : 'Invalide', r === 0 ? 'good' : 'bad').svg : undefined),
  });
  add(panel(X, y, CW, certs.h + 60, 'Certificats TLS') + certs.svg);
  add(marker(5, X, y));
  y += certs.h + 60 + GAP;

  const ev = eventList(X + 16, y + 44, CW - 32, 3, { details: true });
  add(panel(X, y, CW, ev.h + 56, 'Historique des événements') + ev.svg);
  add(marker(6, X, y));
}));

written.push(page('05-dependances.svg', 'Maquette : dépendances', 'dependencies', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Dépendances', 'Par quel équipement chaque machine est jointe…', [['Valider toutes les suggestions (26)', { primary: true }]]);
  add(head.svg);
  add(marker(1, head.actionsX - 16, y + 21));
  y += head.h + 12;

  add(panel(X, y, CW, 64));
  add(bar(X + 16, y + 20, CW * 0.9, 9) + bar(X + 16, y + 38, CW * 0.55, 9));
  add(marker(2, X, y));
  y += 64 + GAP;

  add(panel(X, y, CW, 104, 'Incohérences à vérifier (2)'));
  add(badge(X + 16, y + 44, 'Bloquant', 'bad').svg + bar(X + 106, y + 50, CW * 0.6, 9, '#cbd5e1'));
  add(badge(X + 16, y + 72, 'À vérifier', 'warn').svg + bar(X + 106, y + 78, CW * 0.5, 9, '#cbd5e1'));
  add(t(X + CW - 16, y + 26, 'affiché seulement s’il y en a', { size: 10.5, color: C.muted, anchor: 'end' }));
  add(marker(3, X, y));
  y += 104 + GAP;

  add(panel(X, y, CW, 110, 'Ajouter une dépendance'));
  add(select(X + 16, y + 42, 250, 'Machine…') + t(X + 278, y + 61, 'est jointe via', { size: 11.5, color: C.muted }) + select(X + 362, y + 42, 280, 'Passerelle ou équipement amont…'));
  add(button(X + 654, y + 42, 'Ajouter', { primary: true }).svg);
  add(t(X + 16, y + 92, 'Une dépendance ajoutée à la main est validée d’emblée.', { size: 11, color: C.muted }));
  add(marker(4, X, y));
  y += 110 + GAP;

  const statusTone = ['warn', 'warn', 'good', 'good', 'neutral', 'warn'];
  const statusLabel = ['Suggérée', 'Suggérée', 'Validée', 'Validée', 'Rejetée', 'Suggérée'];
  const tb = table(X + 16, y + 56, CW - 32, [['Machine', 1.6], ['Jointe via', 1.6], ['Source', 1.1], ['Statut', 1.1], ['Corrélation', 1.1], ['Vue par le collecteur', 1.5], ['Actions', 3.1]], 6, {
    cells: (r, c, cx, cy) => {
      if (c === 3) return badge(cx, cy + 2, statusLabel[r], statusTone[r]).svg;
      if (c === 6) {
        const labels = statusLabel[r] === 'Validée' ? [['Modifier', { small: true }], ['Rejeter', { small: true }]] : statusLabel[r] === 'Rejetée' ? [['Valider', { small: true, primary: true }], ['Modifier', { small: true }], ['Restaurer', { small: true }]] : [['Valider', { small: true, primary: true }], ['Modifier', { small: true }], ['Rejeter', { small: true }]];
        return buttonsLeft(cx, cy, labels).svg;
      }
      return undefined;
    },
  });
  add(panel(X, y, CW, tb.h + 72));
  add(buttonsLeft(X + 16, y + 16, [['Suggérées (26)', { small: true, primary: true }], ['Validées (0)', { small: true }], ['Rejetées (0)', { small: true }], ['Toutes (26)', { small: true }]]).svg);
  add(tb.svg);
  add(marker(5, X, y));
}));

written.push(page('06-evenements.svg', 'Maquette : événements', 'events', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Événements', 'Pannes, observations, signalements et machines à configurer');
  add(head.svg);
  y += head.h + 12;
  add(select(X, y, 200, 'Toutes les familles') + select(X + 212, y, 180, 'Tous les états'));
  add(marker(1, X, y));
  y += 30 + GAP;
  const ev = eventList(X + 16, y + 16, CW - 32, 6, { actions: true, details: true });
  add(panel(X, y, CW, ev.h + 24) + ev.svg);
  add(marker(2, X, y));
}));

written.push(page('07-machines-a-identifier.svg', 'Maquette : machines à identifier', 'pending', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Équipements à valider', 'Le scan propose, l’humain décide : aucun équipement n’entre au référentiel sans validation');
  add(head.svg);
  y += head.h + 12;
  for (let i = 0; i < 2; i += 1) {
    const cx = X + i * (half + 16);
    add(panel(cx, y, half, 440, i === 0 ? 'pc-atelier-01' : '10.20.12.102'));
    add(details(cx + 16, y + 44, half - 32, ['Adresse IP', 'Adresse MAC', 'Fabricant', 'Détectée']).svg);
    add(t(cx + 16, y + 140, 'Ports et services', { size: 10.5, color: C.muted }));
    add(badge(cx + 16, y + 148, '135 · msrpc', 'neutral').svg + badge(cx + 110, y + 148, '139 · netbios-ssn', 'neutral').svg);
    add(t(cx + 16, y + 200, 'Type', { size: 10.5, color: C.muted }) + select(cx + 16, y + 206, half - 32, 'Non identifié'));
    add(t(cx + 16, y + 254, 'Nom métier', { size: 10.5, color: C.muted }) + input(cx + 16, y + 260, half - 32, 'Poste atelier 1'));
    add(t(cx + 16, y + 308, 'Votre nom (tracé dans l’historique)', { size: 10.5, color: C.muted }) + input(cx + 16, y + 314, half - 32, 'Prénom Nom'));
    add(rect(cx + 16, y + 360, 14, 14, { rx: 3 }) + t(cx + 38, y + 372, 'Équipement critique pour l’activité', { size: 11.5 }));
    add(buttonsLeft(cx + 16, y + 392, [['Valider', { primary: true }], ['Ignorer', {}], ['Exclure', {}]]).svg);
  }
  add(marker(1, X, y));
  add(marker(2, X, y + 196));
}));

written.push(page('08-scans.svg', 'Maquette : scans', 'scans', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Scans', 'L’API interroge le scanner à intervalle régulier (réglable dans Réglages)', [['Lancer un scan maintenant', { primary: true }]]);
  add(head.svg);
  add(marker(1, head.actionsX - 16, y + 21));
  y += head.h + 12;
  const tb = table(X + 16, y + 16, CW - 32, [['État', 1], ['Début', 1.5], ['Fin', 1.5], ['Équipements vus', 1.3], ['Événements ouverts', 1.4], ['Erreur', 3.5]], 10, {
    cells: (r, c, cx, cy, cw) => {
      if (c === 0) return badge(cx, cy + 2, r === 3 ? 'Échec' : 'Réussi', r === 3 ? 'bad' : 'good').svg;
      if (c === 5) return r === 3 ? t(cx, cy + 14, 'connexion refusée — le scanner n’est pas démarré…', { size: 10.5, color: C.bad }) : t(cx, cy + 14, '—', { size: 11, color: C.muted });
      return undefined;
    },
  });
  add(panel(X, y, CW, tb.h + 32) + tb.svg);
  add(marker(2, X, y));
}));

written.push(page('09-reglages.svg', 'Maquette : réglages', 'settings', 520, (add) => {
  let y = 24;
  const head = pageHeader(y, 'Réglages', 'Seuils de surveillance appliqués par l’API');
  add(head.svg);
  y += head.h + 12;
  const fields = [
    'Intervalle entre deux scans', 'Scans sans réponse avant panne', 'Préavis d’expiration des certificats',
    'Baisse de débit signalée', 'Débit plancher', 'Perte de paquets signalée',
    'Charge processeur signalée', 'Occupation mémoire signalée', 'Occupation disque signalée',
    'Conservation des données',
  ];
  add(panel(X, y, CW, 470));
  const colW = (CW - 32 - 32) / 3;
  fields.forEach((label, i) => {
    const cx = X + 16 + (i % 3) * (colW + 16);
    const cy = y + 20 + Math.floor(i / 3) * 84;
    add(t(cx, cy + 12, label, { size: 11.5, weight: 600 }) + input(cx, cy + 20, colW, '5') + bar(cx, cy + 60, colW * 0.7, 7));
  });
  const py = y + 20 + 4 * 84 - 6;
  add(t(X + 16 + colW + 16, py + 12, 'Ports sensibles surveillés', { size: 11.5, weight: 600 }) + input(X + 16 + colW + 16, py + 20, 2 * colW + 16, '21, 23, 25, 110, 143, 445, 1433, 3306, 3389, 5432, 5900'));
  add(button(X + 16, y + 470 - 46, 'Enregistrer', { primary: true }).svg);
  add(marker(1, X, y));
  add(marker(2, X + 16, y + 470 - 46));
}));

// Plan du site : menu, pages et liens entre elles.
written.push((() => {
  const H = 560;
  const box = (x, y, w, title, route, tone = 'neutral') => {
    const [fill, stroke] = tone === 'accent' ? [C.accentSoft, C.accent] : ['#fff', C.line];
    return rect(x, y, w, 52, { fill, stroke, rx: 8 }) + t(x + w / 2, y + 22, title, { size: 12.5, weight: 700, anchor: 'middle' }) + t(x + w / 2, y + 40, route, { size: 10.5, color: C.muted, anchor: 'middle' });
  };
  const arrow = (x1, y1, x2, y2, dash = false) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#64748b" stroke-width="1.3"${dash ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#a)"/>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Plan du site du dashboard NetWatch" font-family="Segoe UI, system-ui, sans-serif">\n`;
  s += `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker></defs>`;
  s += `<rect width="${W}" height="${H}" fill="#fff"/>`;
  s += t(40, 40, 'Plan du site — dashboard NetWatch', { size: 20, weight: 700 });
  s += t(40, 62, 'Gabarit commun (Layout) : menu latéral à gauche, contenu à droite. Chaque page a une entrée dans le menu, sauf la fiche équipement et la page introuvable.', { size: 12, color: C.muted });

  s += rect(420, 90, 260, 56, { fill: C.side, stroke: C.side, rx: 8 }) + t(550, 114, 'Layout — menu latéral', { size: 13, weight: 700, color: '#fff', anchor: 'middle' }) + t(550, 133, 'components/Layout.tsx', { size: 10.5, color: C.sideText, anchor: 'middle' });

  s += rect(40, 180, 300, 200, { fill: '#f8fafc', stroke: C.line, rx: 10, dash: '6 4' }) + t(56, 202, 'ESPACE DIRECTION — gestionnaire', { size: 11, weight: 700, color: C.muted });
  s += box(60, 216, 260, 'Vue d’ensemble', '/');
  s += box(60, 300, 260, 'Rapport hebdomadaire', '/rapport · export PDF');

  s += rect(380, 180, 680, 290, { fill: '#f8fafc', stroke: C.line, rx: 10, dash: '6 4' }) + t(396, 202, 'ESPACE TECHNIQUE — technicien', { size: 11, weight: 700, color: C.muted });
  s += box(400, 216, 200, 'Équipements', '/technique/equipements');
  s += box(620, 216, 200, 'Événements', '/technique/evenements');
  s += box(840, 216, 200, 'À valider', '/technique/a-identifier');
  s += box(400, 300, 200, 'Fiche équipement', '/technique/equipements/:id');
  s += box(620, 300, 200, 'Dépendances', '/technique/dependances', 'accent');
  s += box(840, 300, 200, 'Scans', '/technique/scans');
  s += box(840, 384, 200, 'Réglages', '/technique/reglages');
  s += box(40, 410, 300, 'Page introuvable', 'toute autre adresse');

  s += arrow(470, 146, 190, 178) + arrow(630, 146, 720, 178);
  s += arrow(500, 268, 500, 298, true); // équipements → fiche
  s += arrow(600, 326, 618, 326, true); // fiche ↔ dépendances (passerelle)
  s += arrow(320, 242, 398, 242, true); // vue d'ensemble → équipements (cartes)
  s += arrow(190, 268, 190, 298, true); // vue d'ensemble → rapport

  s += t(40, 498, 'Flèches pleines : le menu donne accès aux deux espaces. Pointillés : liens à l’intérieur des pages.', { size: 11.5, color: C.muted });
  s += t(40, 516, 'Liens dans les pages : les cartes de la vue d’ensemble ouvrent Équipements (filtré par état), Événements et À valider ;', { size: 11.5, color: C.muted });
  s += t(40, 534, 'une ligne d’équipement, d’événement ou de dépendance ouvre la fiche de la machine ; la fiche d’un PC renvoie vers sa passerelle.', { size: 11.5, color: C.muted });
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${C.line}"/></svg>\n`;
  writeFileSync(join(OUT, '00-plan-du-site.svg'), s, 'utf8');
  return '00-plan-du-site.svg';
})());

console.log(`${written.length} maquettes écrites dans docs/squelette/ : ${written.sort().join(', ')}`);
