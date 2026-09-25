import type { ClassifyDeviceInput } from '@netwatch/contracts';
import { Link, useParams } from 'react-router';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { LifecycleBadge, ReachabilityBadge } from '../components/Badges';
import { ClassifyDeviceForm } from '../components/ClassifyDeviceForm';
import { EventList } from '../components/EventList';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime, formatLatency, formatRelative, KIND_LABELS } from '../utils/format';

export function DeviceDetailPage() {
  const { id = '' } = useParams();
  const detail = usePolling(() => api.getDevice(id), [id]);

  const classify = async (input: ClassifyDeviceInput) => {
    await api.classifyDevice(id, input);
    detail.refresh();
  };

  return (
    <>
      <Link to="/technique/equipements" className="back-link">
        ← Retour aux équipements
      </Link>

      <AsyncState {...detail} onRetry={detail.refresh}>
        {({ device, events }) => (
          <>
            <PageHeader
              title={device.label ?? device.hostname ?? device.ip}
              subtitle={`${KIND_LABELS[device.kind]} · vu ${formatRelative(device.lastSeenAt)}`}
              actions={
                <>
                  <ReachabilityBadge status={device.reachability} />
                  <LifecycleBadge lifecycle={device.lifecycle} />
                </>
              }
            />

            <div className="two-columns">
              <section className="panel">
                <h2>Fiche technique</h2>
                <dl className="details">
                  <div>
                    <dt>Adresse IP</dt>
                    <dd className="mono">{device.ip}</dd>
                  </div>
                  <div>
                    <dt>Adresse MAC</dt>
                    <dd className="mono">{device.mac ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Nom réseau</dt>
                    <dd>{device.hostname ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Fabricant</dt>
                    <dd>{device.vendor ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Latence</dt>
                    <dd>{formatLatency(device.latencyMs)}</dd>
                  </div>
                  <div>
                    <dt>Première détection</dt>
                    <dd>{formatDateTime(device.firstSeenAt)}</dd>
                  </div>
                  <div>
                    <dt>Dernier changement d’état</dt>
                    <dd>{formatDateTime(device.lastChangeAt)}</dd>
                  </div>
                  <div>
                    <dt>Ports ouverts</dt>
                    <dd>
                      {device.openPorts.length === 0
                        ? '—'
                        : device.openPorts.map((port) => (
                            <span key={port} className="port">
                              {port}
                            </span>
                          ))}
                    </dd>
                  </div>
                </dl>

                {device.certificates.length > 0 && (
                  <>
                    <h2>Certificats TLS</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Port</th>
                            <th>Sujet</th>
                            <th>Expire le</th>
                            <th>Jours restants</th>
                          </tr>
                        </thead>
                        <tbody>
                          {device.certificates.map((certificate) => (
                            <tr key={`${certificate.port}-${certificate.subject}`}>
                              <td className="mono">{certificate.port}</td>
                              <td>{certificate.subject}</td>
                              <td>{formatDateTime(certificate.expiresAt)}</td>
                              <td>{certificate.daysBeforeExpiry}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              <section className="panel">
                <h2>Identification</h2>
                <p className="muted">
                  Le type et le nom métier renseignés ici servent dans tous les rapports.
                </p>
                <ClassifyDeviceForm device={device} onSubmit={classify} />
              </section>
            </div>

            <section className="panel">
              <h2>Historique des événements</h2>
              <EventList events={events} showDetails />
            </section>
          </>
        )}
      </AsyncState>
    </>
  );
}
