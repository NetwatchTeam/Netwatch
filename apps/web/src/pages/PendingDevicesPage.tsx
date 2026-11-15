import type { ClassifyDeviceInput } from '@netwatch/contracts';
import { useState } from 'react';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { AuthorField } from '../components/AuthorField';
import { ClassifyDeviceForm, DECISION_HELP } from '../components/ClassifyDeviceForm';
import { PortChips } from '../components/Metrics';
import { PageHeader } from '../components/PageHeader';
import { useAuthor } from '../hooks/useAuthor';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime, formatRelative } from '../utils/format';

/**
 * File d'attente des machines détectées. Tant qu'une machine y figure,
 * NetWatch ne sait pas ce qu'elle est et le signale au gestionnaire.
 */
export function PendingDevicesPage() {
  const pending = usePolling(() => api.getDevices({ lifecycle: 'pending_classification' }));

  const [author, setAuthor] = useAuthor();
  const [bulk, setBulk] = useState<{ busy: boolean; message: string | null; error: string | null }>({
    busy: false,
    message: null,
    error: null,
  });

  const classify = async (id: string, input: ClassifyDeviceInput) => {
    await api.classifyDevice(id, input);
    pending.refresh();
  };

  const count = pending.data?.length ?? 0;

  // Tout valider : une confirmation, puis une décision tracée par équipement.
  const validateAll = async () => {
    if (!author.trim()) {
      setBulk({ busy: false, message: null, error: 'Indiquez votre nom : chaque validation est tracée avec son auteur.' });
      return;
    }
    const confirmed = window.confirm(
      `Valider les ${count} équipement(s) en attente ? Ils entreront au référentiel et seront supervisés, ` +
        'avec le rôle et le nom détectés (à préciser ensuite sur chaque fiche).',
    );
    if (!confirmed) return;
    setBulk({ busy: true, message: null, error: null });
    try {
      const result = await api.validateAllPending(author.trim());
      setBulk({ busy: false, message: `${result.validated} équipement(s) validé(s) au nom de ${author.trim()}.`, error: null });
    } catch (err) {
      setBulk({ busy: false, message: null, error: (err as Error).message });
    } finally {
      pending.refresh();
    }
  };

  return (
    <>
      <PageHeader
        title="Équipements à valider"
        subtitle="Le scan propose, l’humain décide : aucun équipement n’entre au référentiel sans validation"
      />

      <section className="panel">
        <ul className="decision-help">
          {(['active', 'ignored', 'excluded'] as const).map((value) => (
            <li key={value}>{DECISION_HELP[value]}</li>
          ))}
        </ul>

        {count > 0 && (
          <div className="bulk-validate">
            <AuthorField value={author} onChange={setAuthor} />
            <button type="button" className="btn btn-primary" disabled={bulk.busy} onClick={() => void validateAll()}>
              {bulk.busy ? 'Validation…' : `Tout valider (${count})`}
            </button>
          </div>
        )}
        {bulk.message && <p className="muted" role="status">{bulk.message}</p>}
        {bulk.error && (
          <p className="error-box" role="alert">
            {bulk.error}
          </p>
        )}
      </section>

      <AsyncState {...pending} onRetry={pending.refresh}>
        {(devices) =>
          devices.length === 0 ? (
            <section className="panel">
              <p className="muted">Aucun équipement en attente : tout ce que le collecteur a trouvé a été validé, ignoré ou exclu.</p>
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
                      <dt>Ports et services</dt>
                      <dd>
                        <PortChips ports={device.ports} />
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
