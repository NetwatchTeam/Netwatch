import type {
  DeviceLifecycle,
  DeviceReachability,
  EventCategory,
  EventSeverity,
  EventStatus,
} from '@netwatch/contracts';
import {
  CATEGORY_LABELS,
  EVENT_STATUS_LABELS,
  LIFECYCLE_LABELS,
  REACHABILITY_LABELS,
  SEVERITY_LABELS,
} from '../utils/format';

/** Les couleurs d'état ne portent jamais l'information seules : le texte l'accompagne toujours. */
export function ReachabilityBadge({ status }: { status: DeviceReachability }) {
  return <span className={`badge state-${status}`}>{REACHABILITY_LABELS[status]}</span>;
}

export function LifecycleBadge({ lifecycle }: { lifecycle: DeviceLifecycle }) {
  return <span className={`badge lifecycle-${lifecycle}`}>{LIFECYCLE_LABELS[lifecycle]}</span>;
}

export function SeverityBadge({ severity }: { severity: EventSeverity }) {
  return <span className={`badge severity-${severity}`}>{SEVERITY_LABELS[severity]}</span>;
}

export function CategoryBadge({ category }: { category: EventCategory }) {
  return <span className={`badge category-${category}`}>{CATEGORY_LABELS[category]}</span>;
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <span className={`badge event-${status}`}>{EVENT_STATUS_LABELS[status]}</span>;
}
