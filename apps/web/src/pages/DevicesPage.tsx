import { DEVICE_KINDS, DEVICE_REACHABILITIES, type DeviceFilters } from '@netwatch/contracts';
import { useSearchParams } from 'react-router';
import { api } from '../api/netwatch';
import { AsyncState } from '../components/AsyncState';
import { DeviceTable } from '../components/DeviceTable';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import { KIND_LABELS, REACHABILITY_LABELS } from '../utils/format';

export function DevicesPage() {
  // Les filtres vivent dans l'URL : un lien vers « les machines hors ligne » se partage.
  const [params, setParams] = useSearchParams();
  const filters: DeviceFilters = {
    q: params.get('q') ?? undefined,
    kind: (params.get('kind') as DeviceFilters['kind']) ?? undefined,
    reachability: (params.get('reachability') as DeviceFilters['reachability']) ?? undefined,
  };

  const devices = usePolling(
    () => api.getDevices(filters),
    [filters.q, filters.kind, filters.reachability],
  );

  const updateFilter = (key: keyof DeviceFilters, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Équipements"
        subtitle={devices.data ? `${devices.data.length} équipement(s)` : undefined}
        actions={
          <button type="button" className="btn" onClick={devices.refresh}>
            Actualiser
          </button>
        }
      />

      <div className="filters">
        <input
          type="search"
          placeholder="Nom, IP, MAC, fabricant…"
          value={filters.q ?? ''}
          onChange={(event) => updateFilter('q', event.target.value)}
        />
        <select
          value={filters.reachability ?? ''}
          onChange={(event) => updateFilter('reachability', event.target.value)}
        >
          <option value="">Tous les états</option>
          {DEVICE_REACHABILITIES.map((value) => (
            <option key={value} value={value}>
              {REACHABILITY_LABELS[value]}
            </option>
          ))}
        </select>
        <select value={filters.kind ?? ''} onChange={(event) => updateFilter('kind', event.target.value)}>
          <option value="">Tous les types</option>
          {DEVICE_KINDS.map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <section className="panel">
        <AsyncState {...devices} onRetry={devices.refresh}>
          {(list) => <DeviceTable devices={list} />}
        </AsyncState>
      </section>
    </>
  );
}
