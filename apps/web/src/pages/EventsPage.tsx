import { EVENT_CATEGORIES, EVENT_STATUSES, type EventFilters } from '@netwatch/contracts';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api/netwatch';
import { AsyncState, ErrorBox } from '../components/AsyncState';
import { EventList } from '../components/EventList';
import { PageHeader } from '../components/PageHeader';
import { usePolling } from '../hooks/usePolling';
import { CATEGORY_LABELS, EVENT_STATUS_LABELS } from '../utils/format';

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const [actionError, setActionError] = useState<Error | null>(null);

  const filters: EventFilters = {
    category: (params.get('category') as EventFilters['category']) ?? undefined,
    status: (params.get('status') as EventFilters['status']) ?? undefined,
  };

  const events = usePolling(() => api.getEvents(filters), [filters.category, filters.status]);

  const updateFilter = (key: keyof EventFilters, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      events.refresh();
    } catch (error) {
      setActionError(error as Error);
    }
  };

  const acknowledge = (id: string) => runAction(() => api.acknowledgeEvent(id));
  const release = (id: string) => runAction(() => api.releaseEvent(id));

  return (
    <>
      <PageHeader
        title="Événements"
        subtitle="Pannes, observations, signalements et machines à configurer"
      />

      <div className="filters">
        <select
          value={filters.category ?? ''}
          onChange={(event) => updateFilter('category', event.target.value)}
        >
          <option value="">Toutes les familles</option>
          {EVENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <select
          value={filters.status ?? ''}
          onChange={(event) => updateFilter('status', event.target.value)}
        >
          <option value="">Tous les états</option>
          {EVENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {EVENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {actionError && <ErrorBox error={actionError} />}

      <section className="panel">
        <AsyncState {...events} onRetry={events.refresh}>
          {(list) => <EventList events={list} onAcknowledge={acknowledge} onRelease={release} showDetails />}
        </AsyncState>
      </section>
    </>
  );
}
