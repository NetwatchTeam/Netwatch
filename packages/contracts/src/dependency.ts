import type { DeviceLinkDto } from './device.js';

/**
 * Dépendance : « la machine `device` est jointe via l'équipement `dependsOn` » (sa passerelle).
 * C'est le graphe qu'utilise la corrélation pour distinguer une machine en panne d'une machine
 * coupée par la panne de sa passerelle.
 */
export const DEPENDENCY_SOURCES = ['discovered', 'manual'] as const;
/** `discovered` : déduite par le collecteur ; `manual` : créée ou corrigée par un utilisateur. */
export type DependencySource = (typeof DEPENDENCY_SOURCES)[number];

export const DEPENDENCY_STATUSES = ['suggested', 'validated', 'rejected'] as const;
/** Seules les dépendances `validated` sont utilisées par la corrélation. */
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number];

export interface DependencyDto {
  id: string;
  device: DeviceLinkDto;
  dependsOn: DeviceLinkDto;
  source: DependencySource;
  status: DependencyStatus;
  /** Vrai si la corrélation des pannes s'appuie sur ce lien (= validé). */
  usedByCorrelation: boolean;
  createdAt: string;
  updatedAt: string;
  /** Dernière fois que le collecteur a constaté ce lien ; `null` s'il ne l'a jamais vu. */
  observedAt: string | null;
}

export const DEPENDENCY_ISSUE_KINDS = ['cycle', 'conflict', 'ignored_upstream', 'multiple_upstreams'] as const;
export type DependencyIssueKind = (typeof DEPENDENCY_ISSUE_KINDS)[number];

export interface DependencyIssueDto {
  kind: DependencyIssueKind;
  /** `critical` : la corrélation est faussée ; `warning` : à vérifier. */
  severity: 'warning' | 'critical';
  message: string;
  dependencyIds: string[];
}

/** Réponse de GET /dependencies. */
export interface DependencyGraphDto {
  dependencies: DependencyDto[];
  issues: DependencyIssueDto[];
  counts: Record<DependencyStatus, number>;
}

/** Corps de POST /dependencies — création manuelle, validée d'emblée. */
export interface CreateDependencyInput {
  deviceId: string;
  dependsOnId: string;
}

/** Corps de PATCH /dependencies/:id — valider, rejeter, restaurer, ou corriger l'équipement amont. */
export interface UpdateDependencyInput {
  status?: DependencyStatus;
  dependsOnId?: string;
}

/** Réponse de DELETE /dependencies/:id. */
export interface DeleteDependencyResultDto {
  /** `rejected` pour une suggestion du collecteur (elle ne sera plus reproposée), `deleted` sinon. */
  outcome: 'deleted' | 'rejected';
  dependency: DependencyDto;
}

/** Réponse de POST /dependencies/validate-suggestions. */
export interface ValidateSuggestionsResultDto {
  validated: number;
  /** Suggestions laissées de côté : elles créeraient un cycle ou contredisent une dépendance validée. */
  skipped: number;
}
