import { useState } from 'react';
import { api } from '../api/netwatch';
import { AsyncState, ErrorBox } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime, formatRelative } from '../utils/format';

const STATUS_LABELS = {
  running: 'En cours',
  succeeded: 'Réussi',
  failed: 'Échec',
} as const;

/** Journal des interrogations du scanner : la première chose à regarder si les données semblent figées. */
export function ScansPage() {
  const [actionError, setActionError] = useState<Error | null>(null);
  const [running, setRunning] = useState(false);
  const scans = usePolling(() => api.getScans());

  const runNow = async () => {
    setRunning(true);
    setActionError(null);
    try {
      await api.runScan();
      scans.refresh();
    } catch (error) {
      setActionError(error as Error);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Scans"
        subtitle="L'API interroge le scanner à intervalle régulier (réglable dans Réglages)"
        actions={
          <button type="button" className="btn btn-primary" disabled={running} onClick={() => void runNow()}>
            {running ? 'Scan en cours…' : 'Lancer un scan maintenant'}
          </button>
        }
      />

      {actionError && <ErrorBox error={actionError} />}

      <section className="panel">
        <AsyncState {...scans} onRetry={scans.refresh}>
          {(runs) =>
            runs.length === 0 ? (
              <p className="muted">Aucun scan enregistré.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>État</th>
                      <th>Début</th>
                      <th>Fin</th>
                      <th>Équipements vus</th>
                      <th>Événements ouverts</th>
                      <th>Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <span className={`badge scan-${run.status}`}>{STATUS_LABELS[run.status]}</span>
                        </td>
                        <td title={formatDateTime(run.startedAt)}>{formatRelative(run.startedAt)}</td>
                        <td>{formatDateTime(run.finishedAt)}</td>
                        <td>{run.devicesSeen}</td>
                        <td>{run.eventsRaised}</td>
                        <td className="error-cell">{run.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </AsyncState>
      </section>
    </>
  );
}
