import type { ClassifyDeviceInput, DeviceDto, DeviceLinkDto } from '@netwatch/contracts';
import { Link, useParams } from 'react-router';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { LifecycleBadge, ReachabilityBadge } from '../components/Badges';
import { ClassifyDeviceForm } from '../components/ClassifyDeviceForm';
import { EventList } from '../components/EventList';
import { CertificateStatusBadge, MetricValue, UsageBar } from '../components/Metrics';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import {
  certificateDaysTone,
  formatDate,
  formatDateTime,
  formatGigabytes,
  formatLatency,
  formatMegabytes,
  formatPercentValue,
  formatRelative,
  formatServices,
  KIND_LABELS,
  packetLossTone,
} from '../utils/format';

function HealthPanel({ device }: { device: DeviceDto }) {
  const offline = device.reachability === 'down';
  const hasResources = device.cpuPercent !== null || device.memory !== null || device.disks.length > 0;

  return (
    <section className="panel">
      <h2>État de la machine</h2>
      {offline && (
        <p className="muted">
          La machine ne répond plus : les mesures instantanées sont indisponibles. Les disques affichés
          sont ceux du dernier scan réussi.
        </p>
      )}

      <dl className="details">
        <div>
          <dt>Latence</dt>
          <dd>{formatLatency(device.latencyMs)}</dd>
        </div>
        <div>
          <dt>Perte de paquets</dt>
          <dd>
            {device.packetLossPercent === null ? (
              '—'
            ) : (
              <MetricValue
                text={formatPercentValue(device.packetLossPercent)}
                tone={packetLossTone(device.packetLossPercent)}
              />
            )}
          </dd>
        </div>
        <div>
          <dt>Charge processeur</dt>
          <dd>
            <UsageBar percent={device.cpuPercent} label="Charge processeur" />
          </dd>
        </div>
        <div>
          <dt>Mémoire</dt>
          <dd>
            <UsageBar percent={device.memory?.usedPercent ?? null} label="Mémoire utilisée" />
            {device.memory?.totalMb != null && (
              <span className="muted"> sur {formatMegabytes(device.memory.totalMb)}</span>
            )}
          </dd>
        </div>
      </dl>

      {device.disks.length > 0 && (
        <>
          <h3>Disques</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Disque</th>
                  <th>Occupation</th>
                  <th>Capacité</th>
                </tr>
              </thead>
              <tbody>
                {device.disks.map((disk) => (
                  <tr key={disk.name}>
                    <td className="mono">{disk.name}</td>
                    <td>
                      <UsageBar percent={disk.usedPercent} label={`Occupation du disque ${disk.name}`} />
                    </td>
                    <td>{formatGigabytes(disk.totalGb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!hasResources && !offline && (
        <p className="muted">
          Cet équipement ne remonte ni processeur, ni mémoire, ni disques (pas d’agent installé, ou
          matériel réseau / imprimante).
        </p>
      )}
    </section>
  );
}

/** Pour une passerelle : les machines qui passent par elle, et leur état. */
function DependentsPanel({ device, dependents }: { device: DeviceDto; dependents: DeviceLinkDto[] }) {
  if (dependents.length === 0) return null;
  const offline = dependents.filter((d) => d.reachability === 'down' || d.reachability === 'unreachable');

  return (
    <section className="panel">
      <h2>Machines derrière cette passerelle ({dependents.length})</h2>
      <p className="muted">
        {device.reachability === 'down'
          ? 'La passerelle est en panne : les machines ci-dessous sont coupées du réseau.'
          : offline.length === dependents.length
            ? 'La passerelle répond mais aucune machine derrière elle ne répond : panne probable en aval (switch, câblage, alimentation).'
            : `${offline.length} machine(s) hors service sur ${dependents.length}.`}
      </p>
      <ul className="dependent-list">
        {dependents.map((dependent) => (
          <li key={dependent.id}>
            <ReachabilityBadge status={dependent.reachability} />
            <Link to={`/technique/equipements/${dependent.id}`}>{dependent.name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PortsPanel({ device }: { device: DeviceDto }) {
  return (
    <section className="panel">
      <h2>Ports et services</h2>
      {device.ports.length === 0 ? (
        <p className="muted">Aucun port ouvert détecté.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Port</th>
                <th>Protocole</th>
                <th>Service(s)</th>
              </tr>
            </thead>
            <tbody>
              {device.ports.map((entry) => (
                <tr key={`${entry.protocol}-${entry.port}`}>
                  <td className="mono">{entry.port}</td>
                  <td>{entry.protocol.toUpperCase()}</td>
                  <td className={entry.services.length === 0 ? 'muted' : undefined}>{formatServices(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CertificatesPanel({ device }: { device: DeviceDto }) {
  return (
    <section className="panel">
      <h2>Certificats TLS</h2>
      {device.certificates.length === 0 ? (
        <p className="muted">Aucun certificat présenté par cette machine.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Port</th>
                <th>Sujet</th>
                <th>Émetteur</th>
                <th>Valide depuis</th>
                <th>Expire le</th>
                <th>Jours restants</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              {device.certificates.map((certificate) => (
                <tr key={`${certificate.port}-${certificate.subject}`}>
                  <td className="mono">{certificate.port}</td>
                  <td>{certificate.subject}</td>
                  <td>{certificate.issuer ?? '—'}</td>
                  <td>{formatDate(certificate.validFrom)}</td>
                  <td>{formatDateTime(certificate.expiresAt)}</td>
                  <td>
                    <MetricValue
                      text={String(certificate.daysBeforeExpiry)}
                      tone={certificateDaysTone(certificate.daysBeforeExpiry)}
                    />
                  </td>
                  <td>
                    <CertificateStatusBadge status={certificate.status} />
                    {certificate.validationError && (
                      <div className="muted small">{certificate.validationError}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

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
        {({ device, dependents, events }) => (
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
                    <dt>Passerelle</dt>
                    <dd>
                      {device.gateway ? (
                        <>
                          <Link to={`/technique/equipements/${device.gateway.id}`}>{device.gateway.name}</Link>{' '}
                          <ReachabilityBadge status={device.gateway.reachability} />
                        </>
                      ) : (
                        <span className="mono">{device.gatewayIp ?? '—'}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Première détection</dt>
                    <dd>{formatDateTime(device.firstSeenAt)}</dd>
                  </div>
                  <div>
                    <dt>Dernier changement d’état</dt>
                    <dd>{formatDateTime(device.lastChangeAt)}</dd>
                  </div>
                </dl>
              </section>

              <section className="panel">
                <h2>Identification</h2>
                <p className="muted">
                  Le type et le nom métier renseignés ici servent dans tous les rapports.
                </p>
                <ClassifyDeviceForm device={device} onSubmit={classify} />
              </section>
            </div>

            <DependentsPanel device={device} dependents={dependents} />

            <div className="two-columns">
              <HealthPanel device={device} />
              <PortsPanel device={device} />
            </div>

            <CertificatesPanel device={device} />

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
