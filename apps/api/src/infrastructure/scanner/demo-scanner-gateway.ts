import type { ScanSnapshot, ScannerGateway } from '../../application/ports/scanner-gateway.js';
import type { Clock } from '../../application/ports/system.js';
import type { DeviceObservation, OpenPort, PortService } from '../../domain/entities/device.js';

/** Services typiques par port, pour que la démonstration ressemble à un vrai scan. */
const SERVICES: Record<number, PortService> = {
  22: { name: 'ssh', product: 'OpenSSH', version: '9.6' },
  23: { name: 'telnet', product: null, version: null },
  53: { name: 'domain', product: 'dnsmasq', version: '2.89' },
  80: { name: 'http', product: 'lighttpd', version: '1.4' },
  88: { name: 'kerberos-sec', product: 'Microsoft Windows Kerberos', version: null },
  135: { name: 'msrpc', product: 'Microsoft Windows RPC', version: null },
  161: { name: 'snmp', product: null, version: null },
  389: { name: 'ldap', product: 'Microsoft Windows Active Directory LDAP', version: null },
  443: { name: 'https', product: 'nginx', version: '1.24' },
  445: { name: 'microsoft-ds', product: 'Windows SMB', version: '3.1.1' },
  554: { name: 'rtsp', product: null, version: null },
  631: { name: 'ipp', product: 'CUPS', version: '2.4' },
  1433: { name: 'ms-sql-s', product: 'Microsoft SQL Server 2019', version: '15.00' },
  3389: { name: 'ms-wbt-server', product: 'Microsoft Terminal Services', version: null },
  5000: { name: 'http', product: 'Synology DSM', version: '7.2' },
  5060: { name: 'sip', product: null, version: null },
  5900: { name: 'vnc', product: 'RealVNC', version: '6.11' },
  8443: { name: 'https-alt', product: 'FortiGate', version: null },
  9100: { name: 'jetdirect', product: null, version: null },
};

interface DemoHost {
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  ports: number[];
  /** Un hôte « instable » tombe par intermittence, pour alimenter les rapports de démonstration. */
  flaky?: boolean;
  certificateDaysLeft?: number;
  /** Raison d'invalidité du certificat, s'il ne passe pas la vérification. */
  certificateError?: string;
  /** Machine équipée d'un agent : remonte CPU, mémoire et disques. */
  resources?: { cpu: number; memory: number; memoryTotalMb: number; disks: Array<[string, number, number]> };
  /** Perte de paquets habituelle, en %. */
  packetLoss?: number;
}

const HOSTS: DemoHost[] = [
  { ip: '192.168.1.1', mac: '3c:52:82:4a:10:01', hostname: 'routeur-fai', vendor: 'Orange', ports: [53, 80, 443] },
  { ip: '192.168.1.2', mac: '3c:52:82:4a:10:02', hostname: 'fw-principal', vendor: 'Fortinet', ports: [443, 8443], certificateDaysLeft: 12 },
  { ip: '192.168.1.3', mac: '3c:52:82:4a:10:03', hostname: 'sw-core-01', vendor: 'Cisco', ports: [22, 80, 161] },
  { ip: '192.168.1.4', mac: '3c:52:82:4a:10:04', hostname: 'sw-etage-01', vendor: 'Netgear', ports: [23, 80], flaky: true, packetLoss: 8 },
  {
    ip: '192.168.1.10', mac: '3c:52:82:4a:10:10', hostname: 'srv-ad-01', vendor: 'Dell', ports: [53, 88, 389, 445, 3389],
    resources: { cpu: 18, memory: 54, memoryTotalMb: 16_384, disks: [['C:', 41, 238]] },
  },
  {
    ip: '192.168.1.11', mac: '3c:52:82:4a:10:11', hostname: 'srv-fichiers', vendor: 'HPE', ports: [445, 3389],
    resources: { cpu: 22, memory: 61, memoryTotalMb: 32_768, disks: [['C:', 48, 238], ['D:', 93, 3_726]] },
  },
  {
    ip: '192.168.1.12', mac: '3c:52:82:4a:10:12', hostname: 'srv-erp', vendor: 'Dell', ports: [443, 1433], certificateDaysLeft: 45,
    certificateError: 'certificat auto-signé',
    resources: { cpu: 64, memory: 87, memoryTotalMb: 65_536, disks: [['C:', 57, 476], ['E:', 72, 1_863]] },
  },
  {
    ip: '192.168.1.20', mac: '3c:52:82:4a:10:20', hostname: 'nas-backup', vendor: 'Synology', ports: [443, 5000], flaky: true,
    resources: { cpu: 12, memory: 38, memoryTotalMb: 8_192, disks: [['volume1', 81, 15_360]] },
  },
  { ip: '192.168.1.30', mac: '3c:52:82:4a:10:30', hostname: 'imp-compta', vendor: 'Brother', ports: [631, 9100] },
  { ip: '192.168.1.31', mac: '3c:52:82:4a:10:31', hostname: 'imp-rdc', vendor: 'HP', ports: [80, 631] },
  { ip: '192.168.1.40', mac: '3c:52:82:4a:10:40', hostname: 'ap-accueil', vendor: 'Ubiquiti', ports: [22, 443] },
  { ip: '192.168.1.41', mac: '3c:52:82:4a:10:41', hostname: 'ap-openspace', vendor: 'Ubiquiti', ports: [22, 443], packetLoss: 2 },
  { ip: '192.168.1.50', mac: '3c:52:82:4a:10:50', hostname: 'cam-parking', vendor: 'Hikvision', ports: [80, 554] },
  {
    ip: '192.168.1.60', mac: '3c:52:82:4a:10:60', hostname: 'pc-direction', vendor: 'Lenovo', ports: [135, 445],
    resources: { cpu: 9, memory: 47, memoryTotalMb: 16_384, disks: [['C:', 63, 476]] },
  },
  {
    ip: '192.168.1.61', mac: '3c:52:82:4a:10:61', hostname: 'pc-compta-01', vendor: 'Dell', ports: [135, 445],
    resources: { cpu: 15, memory: 72, memoryTotalMb: 8_192, disks: [['C:', 88, 238]] },
  },
  {
    ip: '192.168.1.62', mac: '3c:52:82:4a:10:62', hostname: 'pc-compta-02', vendor: 'Dell', ports: [135, 445, 5900],
    resources: { cpu: 11, memory: 58, memoryTotalMb: 8_192, disks: [['C:', 52, 238]] },
  },
  {
    ip: '192.168.1.63', mac: '3c:52:82:4a:10:63', hostname: 'pc-commercial-01', vendor: 'HP', ports: [135],
    resources: { cpu: 7, memory: 44, memoryTotalMb: 16_384, disks: [['C:', 39, 476]] },
  },
  { ip: '192.168.1.70', mac: '3c:52:82:4a:10:70', hostname: 'tel-standard', vendor: 'Yealink', ports: [80, 5060] },
];

/** Machine qui apparaît après un moment de fonctionnement : illustre la détection d'un nouvel équipement. */
const LATE_ARRIVAL: DemoHost = {
  ip: '192.168.1.99',
  mac: '3c:52:82:4a:10:99',
  hostname: 'esp-inconnu',
  vendor: 'Espressif',
  ports: [23, 80],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Scanner fictif : permet de faire tourner et de démontrer le produit
 * sans matériel ni scanner installé (SCANNER_MODE=demo).
 */
export class DemoScannerGateway implements ScannerGateway {
  private scanCount = 0;

  constructor(private readonly clock: Clock) {}

  async fetchSnapshot(): Promise<ScanSnapshot> {
    const now = this.clock.now();
    this.scanCount += 1;

    const hosts = this.scanCount > 3 ? [...HOSTS, LATE_ARRIVAL] : HOSTS;
    const responding = hosts.filter((host) => !host.flaky || this.scanCount % 5 !== 0);

    return {
      scannedAt: now,
      devices: responding.map((host) => this.observe(host, now)),
      throughput: [
        { sourceIp: '192.168.1.60', targetIp: '192.168.1.11', mbps: this.degradeEvery(7, 920, 60) },
        { sourceIp: '192.168.1.61', targetIp: '192.168.1.11', mbps: this.jitter(880, 40) },
        { sourceIp: '192.168.1.20', targetIp: '192.168.1.11', mbps: this.jitter(640, 30) },
      ],
    };
  }

  private observe(host: DemoHost, now: Date): DeviceObservation {
    const ports: OpenPort[] = host.ports.map((port) => ({
      port,
      protocol: 'tcp',
      services: SERVICES[port] ? [SERVICES[port]] : [],
    }));
    const resources = host.resources;
    // Pic de charge ponctuel sur l'ERP (traitement de nuit), pour illustrer la saturation.
    const cpuSpike = host.hostname === 'srv-erp' && this.scanCount % 6 === 0 ? 30 : 0;

    return {
      ip: host.ip,
      mac: host.mac,
      hostname: host.hostname,
      vendor: host.vendor,
      gatewayIp: null,
      latencyMs: Number((1 + Math.random() * 12).toFixed(1)),
      packetLossPercent: host.packetLoss === undefined ? 0 : this.clamp(this.jitter(host.packetLoss, 4)),
      cpuPercent: resources ? this.clamp(this.jitter(resources.cpu + cpuSpike, 10)) : null,
      memory: resources
        ? { usedPercent: this.clamp(this.jitter(resources.memory, 4)), totalMb: resources.memoryTotalMb }
        : null,
      disks: resources
        ? resources.disks.map(([name, usedPercent, totalGb]) => ({ name, usedPercent, totalGb }))
        : [],
      ports,
      certificates:
        host.certificateDaysLeft === undefined
          ? []
          : [
              {
                port: 443,
                subject: `CN=${host.hostname}.local`,
                issuer: host.certificateError ? `CN=${host.hostname}.local` : 'Autorité interne NetWatch',
                validFrom: new Date(now.getTime() - (365 - host.certificateDaysLeft) * DAY_MS),
                expiresAt: new Date(now.getTime() + host.certificateDaysLeft * DAY_MS),
                valid: host.certificateError === undefined,
                validationError: host.certificateError ?? null,
              },
            ],
    };
  }

  private clamp(percent: number): number {
    return Math.min(100, Math.max(0, percent));
  }

  private jitter(base: number, spread: number): number {
    return Number((base + (Math.random() - 0.5) * spread).toFixed(1));
  }

  private degradeEvery(period: number, base: number, spread: number): number {
    return this.scanCount % period === 0 ? this.jitter(base * 0.25, spread) : this.jitter(base, spread);
  }
}
