import type { DeviceDto } from '@netwatch/contracts';
import { Link } from 'react-router';
import {
  formatLatency,
  formatPercentValue,
  formatRelative,
  KIND_LABELS,
  packetLossTone,
  usageTone,
} from '../utils/format';
import { LifecycleBadge, ReachabilityBadge } from './Badges';
import { MetricValue } from './Metrics';

/** Le disque le plus rempli résume l'état du stockage dans le tableau. */
function fullestDisk(device: DeviceDto) {
  return device.disks.reduce<DeviceDto['disks'][number] | null>(
    (fullest, disk) => (fullest === null || disk.usedPercent > fullest.usedPercent ? disk : fullest),
    null,
  );
}

function Usage({ percent, title }: { percent: number | null; title?: string }) {
  if (percent === null) return <span className="muted">—</span>;
  return <MetricValue text={formatPercentValue(percent)} tone={usageTone(percent)} title={title} />;
}

export function DeviceTable({ devices }: { devices: DeviceDto[] }) {
  if (devices.length === 0) return <p className="muted">Aucun équipement.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>État</th>
            <th>Équipement</th>
            <th>Adresse IP</th>
            <th>Type</th>
            <th>Latence</th>
            <th>Perte</th>
            <th>CPU</th>
            <th>Mémoire</th>
            <th>Disque</th>
            <th>Alertes</th>
            <th>Vu</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => {
            const disk = fullestDisk(device);
            return (
              <tr key={device.id}>
                <td>
                  <ReachabilityBadge status={device.reachability} />
                </td>
                <td>
                  <Link to={`/technique/equipements/${device.id}`}>
                    {device.label ?? device.hostname ?? device.ip}
                  </Link>
                  {device.critical && <span className="tag">Critique</span>}
                  {device.lifecycle !== 'active' && <LifecycleBadge lifecycle={device.lifecycle} />}
                  {device.origin === 'manual' && <span className="tag">Manuel</span>}
                </td>
                <td className="mono">{device.ip}</td>
                <td>{KIND_LABELS[device.kind]}</td>
                <td>{formatLatency(device.latencyMs)}</td>
                <td>
                  {device.packetLossPercent === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <MetricValue
                      text={formatPercentValue(device.packetLossPercent)}
                      tone={packetLossTone(device.packetLossPercent)}
                    />
                  )}
                </td>
                <td>
                  <Usage percent={device.cpuPercent} />
                </td>
                <td>
                  <Usage percent={device.memory?.usedPercent ?? null} />
                </td>
                <td>
                  <Usage percent={disk?.usedPercent ?? null} title={disk ? `Disque le plus rempli : ${disk.name}` : undefined} />
                </td>
                <td>{device.openEvents > 0 ? device.openEvents : '—'}</td>
                <td title={device.lastSeenAt ?? 'Jamais vu par le collecteur'}>
                  {device.lastSeenAt ? formatRelative(device.lastSeenAt) : 'jamais'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
