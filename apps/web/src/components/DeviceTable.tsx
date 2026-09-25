import type { DeviceDto } from '@netwatch/contracts';
import { Link } from 'react-router';
import { formatLatency, formatRelative, KIND_LABELS } from '../utils/format';
import { LifecycleBadge, ReachabilityBadge } from './Badges';

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
            <th>Alertes</th>
            <th>Vu</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td>
                <ReachabilityBadge status={device.reachability} />
              </td>
              <td>
                <Link to={`/technique/equipements/${device.id}`}>
                  {device.label ?? device.hostname ?? device.ip}
                </Link>
                {device.critical && <span className="tag">Critique</span>}
                {device.lifecycle === 'pending_classification' && (
                  <LifecycleBadge lifecycle={device.lifecycle} />
                )}
              </td>
              <td className="mono">{device.ip}</td>
              <td>{KIND_LABELS[device.kind]}</td>
              <td>{formatLatency(device.latencyMs)}</td>
              <td>{device.openEvents > 0 ? device.openEvents : '—'}</td>
              <td title={device.lastSeenAt}>{formatRelative(device.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
