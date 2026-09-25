import type { EventDto } from '@netwatch/contracts';
import { Link } from 'react-router';
import { formatDuration, formatRelative } from '../utils/format';
import { CategoryBadge, EventStatusBadge, SeverityBadge } from './Badges';

interface EventListProps {
  events: EventDto[];
  onAcknowledge?: (id: string) => void;
  onRelease?: (id: string) => void;
  /** Vue technicien : affiche les valeurs mesurées sous le résumé. */
  showDetails?: boolean;
}

export function EventList({ events, onAcknowledge, onRelease, showDetails = false }: EventListProps) {
  if (events.length === 0) return <p className="muted">Rien à signaler.</p>;

  return (
    <ul className="event-list">
      {events.map((event) => (
        <li key={event.id} className={event.status === 'resolved' ? 'resolved' : undefined}>
          <div className="event-badges">
            <CategoryBadge category={event.category} />
            <SeverityBadge severity={event.severity} />
          </div>

          <div className="event-body">
            <span className="event-summary">{event.summary}</span>
            <span className="muted">
              <Link to={`/technique/equipements/${event.deviceId}`}>{event.deviceName}</Link>
              {' · '}
              {event.status === 'resolved'
                ? `résolu ${formatRelative(event.resolvedAt)} après ${formatDuration(event.durationSeconds)}`
                : `depuis ${formatDuration(event.durationSeconds)}`}
            </span>
            {showDetails && Object.keys(event.details).length > 0 && (
              <dl className="event-details">
                {Object.entries(event.details).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd className="mono">{value === null ? '—' : String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="event-actions">
            <EventStatusBadge status={event.status} />
            {onAcknowledge && event.status === 'open' && (
              <button type="button" className="btn btn-small" onClick={() => onAcknowledge(event.id)}>
                Prendre en charge
              </button>
            )}
            {onRelease && event.status === 'acknowledged' && (
              <button type="button" className="btn btn-small" onClick={() => onRelease(event.id)}>
                Retirer la prise en charge
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
