import type { DependencyDto, DependencyStatus, DeviceDto } from '@netwatch/contracts';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api/netwatch';
import { AsyncState, ErrorBox } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import { DEPENDENCY_SOURCE_LABELS, DEPENDENCY_STATUS_LABELS, formatRelative } from '../utils/format';

type Filter = DependencyStatus | 'all';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'suggested', label: 'Suggérées' },
  { value: 'validated', label: 'Validées' },
  { value: 'rejected', label: 'Rejetées' },
  { value: 'all', label: 'Toutes' },
];

function deviceName(device: DeviceDto): string {
  return device.label ?? device.hostname ?? device.ip;
}

function DeviceSelect({
  devices,
  value,
  onChange,
  exclude,
  placeholder,
}: {
  devices: DeviceDto[];
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
  placeholder: string;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">{placeholder}</option>
      {devices
        .filter((device) => device.id !== exclude)
        .map((device) => (
          <option key={device.id} value={device.id}>
            {deviceName(device)} ({device.ip})
          </option>
        ))}
    </select>
  );
}

interface RowProps {
  dependency: DependencyDto;
  devices: DeviceDto[];
  run: (action: () => Promise<unknown>) => Promise<void>;
  flagged: boolean;
}

function DependencyRow({ dependency, devices, run, flagged }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(dependency.dependsOn.id);
  const { id, status, source } = dependency;

  const save = async () => {
    await run(() => api.updateDependency(id, { dependsOnId: target }));
    setEditing(false);
  };

  return (
    <tr className={flagged ? 'row-flagged' : undefined}>
      <td>
        <Link to={`/technique/equipements/${dependency.device.id}`}>{dependency.device.name}</Link>
      </td>
      <td>
        {editing ? (
          <DeviceSelect
            devices={devices}
            value={target}
            onChange={setTarget}
            exclude={dependency.device.id}
            placeholder="Choisir l’équipement…"
          />
        ) : (
          <Link to={`/technique/equipements/${dependency.dependsOn.id}`}>{dependency.dependsOn.name}</Link>
        )}
      </td>
      <td>{DEPENDENCY_SOURCE_LABELS[source]}</td>
      <td>
        <span className={`badge dependency-${status}`}>{DEPENDENCY_STATUS_LABELS[status]}</span>
      </td>
      <td>{dependency.usedByCorrelation ? 'Utilisée' : <span className="muted">Ignorée</span>}</td>
      <td title={dependency.observedAt ?? undefined}>
        {dependency.observedAt ? formatRelative(dependency.observedAt) : <span className="muted">Jamais</span>}
      </td>
      <td className="row-actions">
        {editing ? (
          <>
            <button type="button" className="btn btn-small btn-primary" disabled={!target} onClick={() => void save()}>
              Enregistrer
            </button>
            <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>
              Annuler
            </button>
          </>
        ) : (
          <>
            {status !== 'validated' && (
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={() => void run(() => api.updateDependency(id, { status: 'validated' }))}
              >
                Valider
              </button>
            )}
            <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
              Modifier
            </button>
            {status === 'rejected' && source === 'discovered' ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void run(() => api.updateDependency(id, { status: 'suggested' }))}
              >
                Restaurer
              </button>
            ) : status !== 'rejected' ? (
              <button type="button" className="btn btn-small" onClick={() => void run(() => api.deleteDependency(id))}>
                {source === 'manual' ? 'Supprimer' : 'Rejeter'}
              </button>
            ) : null}
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * Contrôle humain du graphe de dépendances : le collecteur propose, l'utilisateur dispose.
 * Seules les dépendances validées servent à distinguer une panne de passerelle d'une panne de machine.
 */
export function DependenciesPage() {
  const graph = usePolling(() => api.getDependencies());
  const devices = usePolling(() => api.getDevices(), [], 0);
  const [filter, setFilter] = useState<Filter>('suggested');
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ deviceId: '', dependsOnId: '' });

  /** Toute action recharge le graphe ; une erreur (cycle refusé…) reste affichée. */
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      graph.refresh();
    } catch (err) {
      setError(err as Error);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await api.createDependency(draft);
      setDraft({ deviceId: '', dependsOnId: '' });
    });
  };

  const validateAll = () =>
    run(async () => {
      const result = await api.validateAllSuggestions();
      setNotice(
        `${result.validated} suggestion(s) validée(s)` +
          (result.skipped > 0
            ? ` ; ${result.skipped} laissée(s) de côté : elles créeraient un cycle ou contredisent une dépendance validée.`
            : '.'),
      );
    });

  const counts = graph.data?.counts;

  return (
    <>
      <PageHeader
        title="Dépendances"
        subtitle="Par quel équipement chaque machine est jointe : c’est ce graphe qui permet de distinguer une passerelle en panne de machines en panne"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!counts || counts.suggested === 0}
            onClick={() => void validateAll()}
          >
            Valider toutes les suggestions{counts ? ` (${counts.suggested})` : ''}
          </button>
        }
      />

      <section className="panel">
        <p className="muted">
          Le collecteur <strong>suggère</strong> une dépendance quand il voit une machine derrière une passerelle.
          Tant qu’elle n’est pas <strong>validée</strong>, la corrélation l’ignore : si la passerelle tombe, ses
          machines sont comptées « en panne » une par une au lieu d’être « injoignables ». Rejeter une suggestion
          empêche qu’elle soit reproposée.
        </p>
      </section>

      {error && <ErrorBox error={error} />}
      {notice && <p className="notice">{notice}</p>}

      <AsyncState {...graph} onRetry={graph.refresh}>
        {(data) => {
          const flagged = new Set(data.issues.flatMap((issue) => issue.dependencyIds));
          const rows = data.dependencies.filter((d) => filter === 'all' || d.status === filter);
          const deviceList = devices.data ?? [];

          return (
            <>
              {data.issues.length > 0 && (
                <section className="panel">
                  <h2>Incohérences à vérifier ({data.issues.length})</h2>
                  <ul className="finding-list">
                    {data.issues.map((issue) => (
                      <li key={`${issue.kind}-${issue.dependencyIds.join('-')}`}>
                        <span className={`badge severity-${issue.severity}`}>
                          {issue.severity === 'critical' ? 'Bloquant' : 'À vérifier'}
                        </span>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="panel">
                <h2>Ajouter une dépendance</h2>
                <form className="filters" onSubmit={(event) => void create(event)}>
                  <DeviceSelect
                    devices={deviceList}
                    value={draft.deviceId}
                    onChange={(deviceId) => setDraft((d) => ({ ...d, deviceId }))}
                    placeholder="Machine…"
                  />
                  <span className="muted">est jointe via</span>
                  <DeviceSelect
                    devices={deviceList}
                    value={draft.dependsOnId}
                    exclude={draft.deviceId}
                    onChange={(dependsOnId) => setDraft((d) => ({ ...d, dependsOnId }))}
                    placeholder="Passerelle ou équipement amont…"
                  />
                  <button type="submit" className="btn btn-primary">
                    Ajouter
                  </button>
                </form>
                <p className="muted">Une dépendance ajoutée à la main est validée d’emblée.</p>
              </section>

              <section className="panel">
                <div className="filters">
                  {FILTERS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`btn btn-small${filter === item.value ? ' btn-primary' : ''}`}
                      onClick={() => setFilter(item.value)}
                    >
                      {item.label} ({item.value === 'all' ? data.dependencies.length : data.counts[item.value]})
                    </button>
                  ))}
                </div>

                {rows.length === 0 ? (
                  <p className="muted">Aucune dépendance dans cette liste.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Machine</th>
                          <th>Jointe via</th>
                          <th>Source</th>
                          <th>Statut</th>
                          <th>Corrélation</th>
                          <th>Vue par le collecteur</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((dependency) => (
                          <DependencyRow
                            key={`${dependency.id}-${dependency.updatedAt}`}
                            dependency={dependency}
                            devices={deviceList}
                            run={run}
                            flagged={flagged.has(dependency.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          );
        }}
      </AsyncState>
    </>
  );
}
