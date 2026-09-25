import type { ClassifyDeviceInput } from '@netwatch/contracts';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { ClassifyDeviceForm } from '../components/ClassifyDeviceForm';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime, formatRelative } from '../utils/format';

/**
 * File d'attente des machines détectées. Tant qu'une machine y figure,
 * NetWatch ne sait pas ce qu'elle est et le signale au gestionnaire.
 */
export function PendingDevicesPage() {
  const pending = usePolling(() => api.getDevices({ lifecycle: 'pending_classification' }));

  const classify = async (id: string, input: ClassifyDeviceInput) => {
    await api.classifyDevice(id, input);
    pending.refresh();
  };

  return (
    <>
      <PageHeader
        title="Machines à identifier"
        subtitle="Nouvelles machines détectées sur le réseau, en attente d'une décision"
      />

      <AsyncState {...pending} onRetry={pending.refresh}>
        {(devices) =>
          devices.length === 0 ? (
            <section className="panel">
              <p className="muted">Aucune machine en attente : le parc est entièrement identifié.</p>
            </section>
          ) : (
            <div className="pending-grid">
              {devices.map((device) => (
                <section className="panel" key={device.id}>
                  <h2>{device.hostname ?? device.ip}</h2>
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
                      <dt>Fabricant</dt>
                      <dd>{device.vendor ?? '—'}</dd>
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
                    <div>
                      <dt>Détectée</dt>
                      <dd title={formatDateTime(device.firstSeenAt)}>
                        {formatRelative(device.firstSeenAt)}
                      </dd>
                    </div>
                  </dl>

                  <ClassifyDeviceForm
                    device={device}
                    onSubmit={(input) => classify(device.id, input)}
                  />
                </section>
              ))}
            </div>
          )
        }
      </AsyncState>
    </>
  );
}
