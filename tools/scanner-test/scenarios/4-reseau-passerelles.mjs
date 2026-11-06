// Réseau de test : 3 serveurs, 5 caméras, 4 passerelles avec 3 à 10 PC chacune (38 équipements).
//
// Au moins un équipement de chaque sorte présente un défaut permanent, et la passerelle
// de l'atelier tombe régulièrement. Le cycle (10 scans, soit 50 min au rythme par défaut)
// montre successivement les deux situations que NetWatch doit distinguer :
//
//   scans 0-2  normal
//   scans 3-4  PASSERELLE EN PANNE : gw-atelier et ses 8 PC ne répondent plus
//              → attendu : panne critique sur gw-atelier, PC « injoignables »
//   scans 5-6  normal
//   scans 7-8  PC EN PANNE : gw-atelier répond, aucun de ses 8 PC ne répond
//              → attendu : PC « en panne » + « panne en aval » signalée sur gw-atelier
//   scan  9    normal
//
// Le serveur appelle `scan()` à chaque GET /scan ; `phase()` alimente GET / et le journal.

export const CYCLE_LENGTH = 10;

const FAILING_GATEWAY = 'gw-atelier';

export function phase(scanNumber) {
  const step = scanNumber % CYCLE_LENGTH;
  if (step === 3 || step === 4) return 'passerelle-en-panne';
  if (step === 7 || step === 8) return 'pc-en-panne';
  return 'normal';
}

const DAY_MS = 24 * 60 * 60 * 1000;

const SERVICES = {
  22: { name: 'ssh', product: 'OpenSSH', version: '9.6' },
  23: { name: 'telnet' },
  25: { name: 'smtp', product: 'Postfix smtpd' },
  80: { name: 'http' },
  135: { name: 'msrpc', product: 'Microsoft Windows RPC' },
  139: { name: 'netbios-ssn', product: 'Microsoft Windows netbios-ssn' },
  443: { name: 'https' },
  445: { name: 'microsoft-ds', product: 'Windows SMB', version: '3.1.1' },
  554: { name: 'rtsp' },
  993: { name: 'imaps', product: 'Dovecot imapd', version: '2.3' },
  1433: { name: 'ms-sql-s', product: 'Microsoft SQL Server 2019', version: '15.00' },
  3389: { name: 'ms-wbt-server', product: 'Microsoft Terminal Services' },
  5900: { name: 'vnc', product: 'RealVNC', version: '6.11' },
};

/** `ports` : numéros, ou `[numéro, { produit, version }]` pour préciser le logiciel servi. */
function ports(list) {
  return list.map((entry) => {
    const [port, override] = Array.isArray(entry) ? entry : [entry, {}];
    const service = { ...(SERVICES[port] ?? { name: 'unknown' }), ...override };
    return { port, protocol: 'tcp', services: [service] };
  });
}

function certificate(now, { port, host, daysLeft, valid = true, error = null, issuer = 'CN=AC interne Exemple' }) {
  const expiresAt = new Date(now.getTime() + daysLeft * DAY_MS);
  return {
    port,
    subject: `CN=${host}.exemple.local`,
    issuer,
    validFrom: new Date(expiresAt.getTime() - 365 * DAY_MS).toISOString(),
    expiresAt: expiresAt.toISOString(),
    valid,
    validationError: error,
  };
}

const mac = (a, b) => `02:20:00:00:${a.toString(16).padStart(2, '0')}:${b.toString(16).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Équipements
// ---------------------------------------------------------------------------

function servers(now) {
  return [
    {
      // Défaut : disque D: presque plein
      ip: '10.20.0.10', mac: mac(0, 10), hostname: 'srv-fichiers', vendor: 'Dell',
      latencyMs: 0.9, packetLossPercent: 0,
      cpuPercent: 23, memory: { usedPercent: 61, totalMb: 32768 },
      disks: [{ name: 'C:', usedPercent: 41, totalGb: 476.9 }, { name: 'D:', usedPercent: 96, totalGb: 7452 }],
      ports: ports([22, 445]),
      certificates: [],
    },
    {
      // Défauts : certificat auto-signé, SQL Server et bureau à distance exposés
      ip: '10.20.0.20', mac: mac(0, 20), hostname: 'srv-erp', vendor: 'HPE',
      latencyMs: 1.2, packetLossPercent: 0,
      cpuPercent: 48, memory: { usedPercent: 77, totalMb: 65536 },
      disks: [{ name: 'C:', usedPercent: 58, totalGb: 476.9 }],
      ports: ports([[443, { product: 'Microsoft IIS httpd', version: '10.0' }], 1433, 3389]),
      certificates: [
        certificate(now, { port: 443, host: 'srv-erp', daysLeft: 210, valid: false, error: 'certificat auto-signé', issuer: 'CN=srv-erp.exemple.local' }),
      ],
    },
    {
      // Défauts : processeur saturé, certificat HTTPS qui expire dans 12 jours
      ip: '10.20.0.30', mac: mac(0, 30), hostname: 'srv-messagerie', vendor: 'Dell',
      latencyMs: 1.1, packetLossPercent: 0,
      cpuPercent: 94, memory: { usedPercent: 70, totalMb: 16384 },
      disks: [{ name: '/', usedPercent: 52, totalGb: 200 }, { name: '/var', usedPercent: 63, totalGb: 500 }],
      ports: ports([25, [443, { product: 'nginx', version: '1.24.0' }], 993]),
      certificates: [
        certificate(now, { port: 443, host: 'srv-messagerie', daysLeft: 12 }),
        certificate(now, { port: 993, host: 'srv-messagerie', daysLeft: 200 }),
      ],
    },
  ];
}

function cameras(now) {
  const camera = (n, hostname, vendor, extra) => ({
    ip: `10.20.0.${50 + n}`, mac: mac(0, 50 + n), hostname, vendor,
    latencyMs: 2.4, packetLossPercent: 0,
    ports: ports([80, 554]),
    certificates: [],
    ...extra,
  });
  return [
    // Défaut : perte de paquets (câble ou alimentation PoE fatigués)
    camera(1, 'cam-entree', 'Hikvision', { packetLossPercent: 12, latencyMs: 9.8 }),
    // Défaut : Telnet ouvert
    camera(2, 'cam-parking', 'Hikvision', { ports: ports([23, 80, 554]) }),
    // Défaut : certificat qui expire dans 5 jours (critique)
    camera(3, 'cam-quai', 'Axis', {
      ports: ports([[443, { product: 'Axis httpd' }], 554]),
      certificates: [certificate(now, { port: 443, host: 'cam-quai', daysLeft: 5 })],
    }),
    camera(4, 'cam-atelier', 'Axis', {
      ports: ports([[443, { product: 'Axis httpd' }], 554]),
      certificates: [certificate(now, { port: 443, host: 'cam-atelier', daysLeft: 280 })],
    }),
    camera(5, 'cam-accueil', 'Dahua', {}),
  ];
}

/** Passerelles : IP côté cœur de réseau 10.20.0.1x, PC derrière elles en 10.20.1x.0/24. */
const GATEWAYS = [
  { n: 11, hostname: 'gw-direction', vendor: 'Ubiquiti', zone: 'direction', pcs: 3 },
  { n: 12, hostname: 'gw-atelier', vendor: 'MikroTik', zone: 'atelier', pcs: 8 },
  { n: 13, hostname: 'gw-compta', vendor: 'Ubiquiti', zone: 'compta', pcs: 5 },
  // Défauts : processeur saturé et perte de paquets (passerelle sous-dimensionnée pour 10 postes)
  { n: 14, hostname: 'gw-commercial', vendor: 'TP-Link', zone: 'commercial', pcs: 10, cpu: 95, loss: 6 },
];

function gateway(now, g) {
  return {
    ip: `10.20.0.${g.n}`, mac: mac(0, g.n), hostname: g.hostname, vendor: g.vendor,
    latencyMs: 0.7, packetLossPercent: g.loss ?? 0,
    // Interrogées en SNMP : processeur et mémoire, pas de disques.
    cpuPercent: g.cpu ?? 18, memory: { usedPercent: 42, totalMb: 1024 },
    ports: ports([22, 443]),
    certificates: [certificate(now, { port: 443, host: g.hostname, daysLeft: 320 })],
  };
}

/** Défauts ponctuels sur certains PC, par nom. */
const PC_DEFECTS = {
  // Défaut : prise en main à distance VNC ouverte
  'pc-direction-02': { ports: ports([135, 139, 5900]) },
  // Défaut : mémoire saturée
  'pc-compta-03': { memory: { usedPercent: 95, totalMb: 8192 } },
  // Défaut : disque système plein
  'pc-commercial-07': { disks: [{ name: 'C:', usedPercent: 97, totalGb: 238.4 }] },
};

const PC_VENDORS = ['Lenovo', 'Dell', 'HP'];

function pcs(g) {
  return Array.from({ length: g.pcs }, (_, index) => {
    const number = index + 1;
    const hostname = `pc-${g.zone}-${String(number).padStart(2, '0')}`;
    return {
      ip: `10.20.${g.n}.${100 + number}`, mac: mac(g.n, number), hostname,
      vendor: PC_VENDORS[index % PC_VENDORS.length],
      gatewayIp: `10.20.0.${g.n}`,
      latencyMs: 2 + (index % 4) * 0.6, packetLossPercent: 0,
      cpuPercent: 6 + ((index * 7) % 25),
      memory: { usedPercent: 40 + ((index * 9) % 30), totalMb: index % 2 === 0 ? 16384 : 8192 },
      disks: [{ name: 'C:', usedPercent: 35 + ((index * 11) % 45), totalGb: 476.9 }],
      ports: ports([135, 139]),
      certificates: [],
      ...PC_DEFECTS[hostname],
    };
  });
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export default function scan({ scanNumber, now }) {
  const current = phase(scanNumber);
  const devices = [...servers(now), ...cameras(now)];
  const throughput = [];

  for (const g of GATEWAYS) {
    const failing = g.hostname === FAILING_GATEWAY;
    const gatewayAnswers = !(failing && current === 'passerelle-en-panne');
    const pcsAnswer = !(failing && current !== 'normal');

    if (gatewayAnswers) {
      devices.push(gateway(now, g));
      // Débit de chaque zone vers le serveur de fichiers : sert de référence d'un scan à l'autre.
      throughput.push({ sourceIp: `10.20.0.${g.n}`, targetIp: '10.20.0.10', mbps: g.loss ? 610 : 935 });
    }
    if (pcsAnswer) devices.push(...pcs(g));
  }

  return { contractVersion: '1.0.0', scannedAt: now.toISOString(), devices, throughput };
}
