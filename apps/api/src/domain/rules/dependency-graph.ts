import { deviceDisplayName, isDismissed, type Device } from '../entities/device.js';
import type { Dependency, DependencyEdge } from '../entities/dependency.js';

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

function adjacency(edges: DependencyEdge[]): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const list = next.get(edge.deviceId) ?? [];
    list.push(edge.dependsOnId);
    next.set(edge.deviceId, list);
  }
  return next;
}

/** Vrai si `to` est atteignable depuis `from` en suivant les dépendances. */
function reaches(next: Map<string, string[]>, from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return false;
}

/**
 * Ajouter « deviceId dépend de dependsOnId » crée un cycle si `dependsOnId`
 * dépend déjà, directement ou non, de `deviceId`. Renvoie alors le chemin fautif.
 */
export function cycleCreatedBy(edges: DependencyEdge[], candidate: DependencyEdge): string[] | null {
  if (candidate.deviceId === candidate.dependsOnId) return [candidate.deviceId, candidate.deviceId];
  const next = adjacency(edges);
  if (!reaches(next, candidate.dependsOnId, candidate.deviceId)) return null;

  // Reconstitue le chemin dependsOnId → … → deviceId pour l'afficher.
  const path = findPath(next, candidate.dependsOnId, candidate.deviceId) ?? [candidate.dependsOnId, candidate.deviceId];
  return [candidate.deviceId, ...path];
}

function findPath(next: Map<string, string[]>, from: string, to: string): string[] | null {
  const parent = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) {
      const path: string[] = [];
      for (let node: string | null = current; node !== null; node = parent.get(node) ?? null) path.unshift(node);
      return path;
    }
    for (const neighbour of next.get(current) ?? []) {
      if (!parent.has(neighbour)) {
        parent.set(neighbour, current);
        queue.push(neighbour);
      }
    }
  }
  return null;
}

/** Tous les cycles élémentaires du graphe, chacun une seule fois (A → B → A). */
export function findCycles(edges: DependencyEdge[]): string[][] {
  const next = adjacency(edges);
  const cycles: string[][] = [];
  const keys = new Set<string>();
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string) => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const neighbour of next.get(node) ?? []) {
      if (state.get(neighbour) === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(neighbour)), neighbour];
        // Même cycle vu depuis un autre point de départ : on le normalise avant de le compter.
        const key = [...cycle.slice(0, -1)].sort().join('|');
        if (!keys.has(key)) {
          keys.add(key);
          cycles.push(cycle);
        }
      } else if (!state.has(neighbour)) {
        visit(neighbour);
      }
    }
    stack.pop();
    state.set(node, 'done');
  };

  for (const node of next.keys()) if (!state.has(node)) visit(node);
  return cycles;
}

// ---------------------------------------------------------------------------
// Incohérences
// ---------------------------------------------------------------------------

export type DependencyIssueKind = 'cycle' | 'conflict' | 'ignored_upstream' | 'multiple_upstreams';

export interface DependencyIssue {
  kind: DependencyIssueKind;
  /** `critical` : la corrélation est faussée ; `warning` : à vérifier. */
  severity: 'warning' | 'critical';
  message: string;
  dependencyIds: string[];
}

/**
 * Ce qu'un humain doit regarder dans le graphe :
 * - un cycle (A dépend de B qui dépend de A) n'a pas de sens pour un chemin réseau ;
 * - le collecteur voit la machine derrière une autre passerelle que celle validée ;
 * - une dépendance validée vers un équipement ignoré (il ne sera plus surveillé) ;
 * - plusieurs dépendances validées pour la même machine.
 */
export function dependencyIssues(dependencies: Dependency[], devices: Device[]): DependencyIssue[] {
  const name = (id: string) => {
    const device = devices.find((d) => d.id === id);
    return device ? deviceDisplayName(device) : id;
  };
  const active = dependencies.filter((d) => d.status !== 'rejected');
  const validated = active.filter((d) => d.status === 'validated');
  const issues: DependencyIssue[] = [];

  for (const cycle of findCycles(active)) {
    const ids = cycle.slice(0, -1).map((from, index) =>
      active.find((d) => d.deviceId === from && d.dependsOnId === cycle[index + 1])!.id,
    );
    const onlyValidated = ids.every((id) => validated.some((d) => d.id === id));
    issues.push({
      kind: 'cycle',
      severity: onlyValidated ? 'critical' : 'warning',
      message:
        `Dépendance circulaire : ${cycle.map(name).join(' → ')}. ` +
        (onlyValidated
          ? 'La corrélation ne peut pas déterminer laquelle de ces machines est la cause d’une panne.'
          : 'Ne validez pas toutes ces suggestions : au moins un de ces liens est faux.'),
      dependencyIds: ids,
    });
  }

  const byDevice = new Map<string, Dependency[]>();
  for (const dependency of active) {
    const list = byDevice.get(dependency.deviceId) ?? [];
    list.push(dependency);
    byDevice.set(dependency.deviceId, list);
  }

  for (const [deviceId, list] of byDevice) {
    const valid = list.filter((d) => d.status === 'validated');
    const suggested = list.filter((d) => d.status === 'suggested' && d.source === 'discovered');

    if (valid.length > 0) {
      for (const suggestion of suggested) {
        issues.push({
          kind: 'conflict',
          severity: 'warning',
          message:
            `Le collecteur voit ${name(deviceId)} derrière ${name(suggestion.dependsOnId)}, ` +
            `mais la dépendance validée indique ${valid.map((d) => name(d.dependsOnId)).join(', ')}. ` +
            'La machine a peut-être été déplacée.',
          dependencyIds: [suggestion.id, ...valid.map((d) => d.id)],
        });
      }
    }

    if (valid.length > 1) {
      issues.push({
        kind: 'multiple_upstreams',
        severity: 'warning',
        message:
          `${name(deviceId)} a ${valid.length} dépendances validées (${valid.map((d) => name(d.dependsOnId)).join(', ')}) : ` +
          'elle sera considérée injoignable dès que l’une d’elles est hors service.',
        dependencyIds: valid.map((d) => d.id),
      });
    }
  }

  for (const dependency of validated) {
    const upstream = devices.find((d) => d.id === dependency.dependsOnId);
    if (upstream && isDismissed(upstream)) {
      issues.push({
        kind: 'ignored_upstream',
        severity: 'warning',
        message:
          `${name(dependency.deviceId)} dépend de ${name(dependency.dependsOnId)}, qui est ${upstream.lifecycle === 'excluded' ? 'exclu' : 'ignoré'} : ` +
          'ses pannes ne sont pas suivies, la corrélation devient incertaine.',
        dependencyIds: [dependency.id],
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Suggestions du collecteur
// ---------------------------------------------------------------------------

export interface DependencySync {
  inserted: Dependency[];
  updated: Dependency[];
  deleted: Dependency[];
}

/**
 * Transforme ce que le collecteur a vu à ce scan (`gatewayIp` des machines qui ont répondu)
 * en suggestions. Ne touche jamais à une décision humaine : une dépendance validée ou rejetée
 * garde son statut ; seule une ancienne suggestion devenue fausse est remplacée.
 */
export function syncDiscoveredDependencies(
  seen: Device[],
  allDevices: Device[],
  existing: Dependency[],
  at: Date,
  nextId: () => string,
): DependencySync {
  const byIp = new Map(allDevices.map((device) => [device.ip, device]));
  const sync: DependencySync = { inserted: [], updated: [], deleted: [] };

  for (const device of seen) {
    if (!device.gatewayIp) continue;
    const upstream = byIp.get(device.gatewayIp);
    if (!upstream || upstream.id === device.id) continue;

    const own = existing.filter((d) => d.deviceId === device.id);
    const match = own.find((d) => d.dependsOnId === upstream.id);

    if (match) {
      sync.updated.push({ ...match, observedAt: at });
    } else {
      sync.inserted.push({
        id: nextId(),
        deviceId: device.id,
        dependsOnId: upstream.id,
        source: 'discovered',
        status: 'suggested',
        createdAt: at,
        updatedAt: at,
        observedAt: at,
      });
    }

    // Une suggestion jamais validée et que le collecteur ne voit plus : on la remplace.
    for (const stale of own) {
      if (stale.dependsOnId !== upstream.id && stale.source === 'discovered' && stale.status === 'suggested') {
        sync.deleted.push(stale);
      }
    }
  }

  return sync;
}

export function applySync(existing: Dependency[], sync: DependencySync): Dependency[] {
  const deleted = new Set(sync.deleted.map((d) => d.id));
  const updated = new Map(sync.updated.map((d) => [d.id, d]));
  return [
    ...existing.filter((d) => !deleted.has(d.id)).map((d) => updated.get(d.id) ?? d),
    ...sync.inserted,
  ];
}
