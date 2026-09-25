import type { EventDetails, EventSeverity, NewEvent } from '../entities/monitoring-event.js';

/**
 * Les règles de détection ne créent ni ne persistent rien : elles décrivent
 * ce qui devrait changer. Le cas d'usage d'ingestion applique ces intentions.
 */
export type DetectionIntent =
  | { action: 'open'; event: NewEvent }
  | { action: 'update'; deviceId: string; dedupeKey: string; severity: EventSeverity; summary: string; details: EventDetails }
  | { action: 'resolve'; deviceId: string; dedupeKey: string; at: Date };

/** Clés des événements encore ouverts pour un équipement, indexées par `dedupeKey`. */
export type OpenEventKeys = ReadonlySet<string>;

export function keysWithPrefix(keys: OpenEventKeys, prefix: string): string[] {
  return [...keys].filter((key) => key === prefix || key.startsWith(`${prefix}:`));
}
