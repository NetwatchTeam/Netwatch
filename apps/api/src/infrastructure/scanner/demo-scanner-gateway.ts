import type { ScanSnapshot, ScannerGateway } from '../../application/ports/scanner-gateway.js';
import type { Clock } from '../../application/ports/system.js';

interface DemoHost {
  ip: string;
  mac: string;
  hostname: string;
  vendor: string;
  ports: number[];
  /** Un hôte « instable » tombe par intermittence, pour alimenter les rapports de démonstration. */
  flaky?: boolean;
  certificateDaysLeft?: number;
}

const HOSTS: DemoHost[] = [
  { ip: '192.168.1.1', mac: '3c:52:82:4a:10:01', hostname: 'routeur-fai', vendor: 'Orange', ports: [53, 80, 443] },
  { ip: '192.168.1.2', mac: '3c:52:82:4a:10:02', hostname: 'fw-principal', vendor: 'Fortinet', ports: [443, 8443], certificateDaysLeft: 12 },
  { ip: '192.168.1.3', mac: '3c:52:82:4a:10:03', hostname: 'sw-core-01', vendor: 'Cisco', ports: [22, 80, 161] },
  { ip: '192.168.1.4', mac: '3c:52:82:4a:10:04', hostname: 'sw-etage-01', vendor: 'Netgear', ports: [23, 80], flaky: true },
  { ip: '192.168.1.10', mac: '3c:52:82:4a:10:10', hostname: 'srv-ad-01', vendor: 'Dell', ports: [53, 88, 389, 445, 3389] },
  { ip: '192.168.1.11', mac: '3c:52:82:4a:10:11', hostname: 'srv-fichiers', vendor: 'HPE', ports: [445, 3389] },
  { ip: '192.168.1.12', mac: '3c:52:82:4a:10:12', hostname: 'srv-erp', vendor: 'Dell', ports: [443, 1433], certificateDaysLeft: 45 },
  { ip: '192.168.1.20', mac: '3c:52:82:4a:10:20', hostname: 'nas-backup', vendor: 'Synology', ports: [443, 5000], flaky: true },
  { ip: '192.168.1.30', mac: '3c:52:82:4a:10:30', hostname: 'imp-compta', vendor: 'Brother', ports: [631, 9100] },
  { ip: '192.168.1.31', mac: '3c:52:82:4a:10:31', hostname: 'imp-rdc', vendor: 'HP', ports: [80, 631] },
  { ip: '192.168.1.40', mac: '3c:52:82:4a:10:40', hostname: 'ap-accueil', vendor: 'Ubiquiti', ports: [22, 443] },
  { ip: '192.168.1.41', mac: '3c:52:82:4a:10:41', hostname: 'ap-openspace', vendor: 'Ubiquiti', ports: [22, 443] },
  { ip: '192.168.1.50', mac: '3c:52:82:4a:10:50', hostname: 'cam-parking', vendor: 'Hikvision', ports: [80, 554] },
  { ip: '192.168.1.60', mac: '3c:52:82:4a:10:60', hostname: 'pc-direction', vendor: 'Lenovo', ports: [135, 445] },
  { ip: '192.168.1.61', mac: '3c:52:82:4a:10:61', hostname: 'pc-compta-01', vendor: 'Dell', ports: [135, 445] },
  { ip: '192.168.1.62', mac: '3c:52:82:4a:10:62', hostname: 'pc-compta-02', vendor: 'Dell', ports: [135, 445, 5900] },
  { ip: '192.168.1.63', mac: '3c:52:82:4a:10:63', hostname: 'pc-commercial-01', vendor: 'HP', ports: [135] },
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
      devices: responding.map((host) => ({
        ip: host.ip,
        mac: host.mac,
        hostname: host.hostname,
        vendor: host.vendor,
        latencyMs: Number((1 + Math.random() * 12).toFixed(1)),
        openPorts: host.ports,
        certificates:
          host.certificateDaysLeft === undefined
            ? []
            : [
                {
                  port: 443,
                  subject: `CN=${host.hostname}.local`,
                  issuer: "Autorité interne NetWatch",
                  expiresAt: new Date(now.getTime() + host.certificateDaysLeft * DAY_MS),
                },
              ],
      })),
      throughput: [
        { sourceIp: '192.168.1.60', targetIp: '192.168.1.11', mbps: this.degradeEvery(7, 920, 60) },
        { sourceIp: '192.168.1.61', targetIp: '192.168.1.11', mbps: this.jitter(880, 40) },
        { sourceIp: '192.168.1.20', targetIp: '192.168.1.11', mbps: this.jitter(640, 30) },
      ],
    };
  }

  private jitter(base: number, spread: number): number {
    return Number((base + (Math.random() - 0.5) * spread).toFixed(1));
  }

  private degradeEvery(period: number, base: number, spread: number): number {
    return this.scanCount % period === 0 ? this.jitter(base * 0.25, spread) : this.jitter(base, spread);
  }
}
