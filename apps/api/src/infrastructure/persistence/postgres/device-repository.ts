import type { DeviceQuery, DeviceRepository } from '../../../application/ports/repositories.js';
import type { Device, DeviceKind, DeviceLifecycle, DeviceReachability } from '../../../domain/entities/device.js';
import type { Database } from './pool.js';

interface DeviceRow {
  id: string;
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  kind: string;
  label: string | null;
  critical: boolean;
  lifecycle: string;
  reachability: string;
  latency_ms: number | null;
  open_ports: number[];
  certificates: Array<{ port: number; subject: string; issuer: string | null; expiresAt: string }>;
  first_seen_at: Date;
  last_seen_at: Date;
  last_change_at: Date;
  missed_scans: number;
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    ip: row.ip,
    mac: row.mac,
    hostname: row.hostname,
    vendor: row.vendor,
    kind: row.kind as DeviceKind,
    label: row.label,
    critical: row.critical,
    lifecycle: row.lifecycle as DeviceLifecycle,
    reachability: row.reachability as DeviceReachability,
    latencyMs: row.latency_ms,
    openPorts: row.open_ports ?? [],
    certificates: (row.certificates ?? []).map((certificate) => ({
      port: certificate.port,
      subject: certificate.subject,
      issuer: certificate.issuer,
      expiresAt: new Date(certificate.expiresAt),
    })),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastChangeAt: row.last_change_at,
    missedScans: row.missed_scans,
  };
}

const UPSERT = `
  insert into devices (
    id, ip, mac, hostname, vendor, kind, label, critical, lifecycle, reachability,
    latency_ms, open_ports, certificates, first_seen_at, last_seen_at, last_change_at, missed_scans
  ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17)
  on conflict (id) do update set
    ip = excluded.ip,
    mac = coalesce(excluded.mac, devices.mac),
    hostname = coalesce(excluded.hostname, devices.hostname),
    vendor = coalesce(excluded.vendor, devices.vendor),
    kind = excluded.kind,
    label = excluded.label,
    critical = excluded.critical,
    lifecycle = excluded.lifecycle,
    reachability = excluded.reachability,
    latency_ms = excluded.latency_ms,
    open_ports = excluded.open_ports,
    certificates = excluded.certificates,
    last_seen_at = excluded.last_seen_at,
    last_change_at = excluded.last_change_at,
    missed_scans = excluded.missed_scans
`;

function toParams(device: Device): unknown[] {
  return [
    device.id,
    device.ip,
    device.mac,
    device.hostname,
    device.vendor,
    device.kind,
    device.label,
    device.critical,
    device.lifecycle,
    device.reachability,
    device.latencyMs,
    device.openPorts,
    JSON.stringify(
      device.certificates.map((certificate) => ({
        port: certificate.port,
        subject: certificate.subject,
        issuer: certificate.issuer,
        expiresAt: certificate.expiresAt.toISOString(),
      })),
    ),
    device.firstSeenAt,
    device.lastSeenAt,
    device.lastChangeAt,
    device.missedScans,
  ];
}

export class PostgresDeviceRepository implements DeviceRepository {
  constructor(private readonly db: Database) {}

  async findAll(query: DeviceQuery = {}): Promise<Device[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.kind) {
      params.push(query.kind);
      conditions.push(`kind = $${params.length}`);
    }
    if (query.lifecycle) {
      params.push(query.lifecycle);
      conditions.push(`lifecycle = $${params.length}`);
    }
    if (query.reachability) {
      params.push(query.reachability);
      conditions.push(`reachability = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`);
      const placeholder = `$${params.length}`;
      conditions.push(
        `(lower(ip) like ${placeholder} or lower(coalesce(hostname, '')) like ${placeholder} ` +
          `or lower(coalesce(label, '')) like ${placeholder} or lower(coalesce(vendor, '')) like ${placeholder} ` +
          `or lower(coalesce(mac, '')) like ${placeholder})`,
      );
    }

    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const { rows } = await this.db.query<DeviceRow>(
      `select * from devices ${where} order by critical desc, coalesce(label, hostname, ip)`,
      params,
    );
    return rows.map(toDevice);
  }

  async findById(id: string): Promise<Device | null> {
    const { rows } = await this.db.query<DeviceRow>('select * from devices where id = $1', [id]);
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async save(device: Device): Promise<void> {
    await this.db.query(UPSERT, toParams(device));
  }

  async saveMany(devices: Device[]): Promise<void> {
    if (devices.length === 0) return;

    const client = await this.db.connect();
    try {
      await client.query('begin');
      for (const device of devices) {
        await client.query(UPSERT, toParams(device));
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
