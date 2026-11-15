import type { DeviceKind, DeviceLifecycle } from './device.js';

/**
 * `created` : ajout manuel ; `merged` : ajout manuel fusionné avec un équipement découvert ;
 * `validated`, `ignored`, `excluded` : décision sur le cycle de vie ; `updated` : fiche modifiée sans changer d'état.
 */
export type DeviceDecisionAction = 'created' | 'merged' | 'validated' | 'ignored' | 'excluded' | 'updated';

/** Trace d'une action humaine sur un équipement : qui, quoi, quand, et l'état obtenu. */
export interface DeviceDecision {
  id: string;
  deviceId: string;
  action: DeviceDecisionAction;
  author: string;
  decidedAt: Date;
  previousLifecycle: DeviceLifecycle | null;
  lifecycle: DeviceLifecycle;
  kind: DeviceKind;
  label: string | null;
  critical: boolean;
}

/** Nomme l'action d'après le passage d'un état à l'autre. */
export function decisionActionFor(previous: DeviceLifecycle, next: DeviceLifecycle): DeviceDecisionAction {
  if (previous === next) return 'updated';
  if (next === 'active') return 'validated';
  if (next === 'ignored') return 'ignored';
  if (next === 'excluded') return 'excluded';
  return 'updated';
}
