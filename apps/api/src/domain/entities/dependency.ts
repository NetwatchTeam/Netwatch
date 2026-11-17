/**
 * Lien « la machine X est jointe via l'équipement Y » (Y est la passerelle de X).
 * C'est le graphe qu'utilise la corrélation des pannes : si Y tombe, X est « injoignable »
 * et non « en panne ».
 *
 * - `discovered` : déduite par le collecteur (`gatewayIp`) — une simple suggestion au départ ;
 * - `manual` : créée ou corrigée par un utilisateur.
 *
 * Seules les dépendances `validated` sont utilisées par la corrélation. Une suggestion
 * rejetée reste en base pour ne pas être reproposée à chaque scan.
 */
export type DependencySource = 'discovered' | 'manual';
export type DependencyStatus = 'suggested' | 'validated' | 'rejected';

export interface Dependency {
  id: string;
  /** La machine qui dépend (ex. un PC). */
  deviceId: string;
  /** L'équipement dont elle dépend (ex. sa passerelle). */
  dependsOnId: string;
  source: DependencySource;
  status: DependencyStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Dernière fois que le collecteur a constaté ce lien ; `null` s'il ne l'a jamais vu. */
  observedAt: Date | null;
}

/** Arête minimale du graphe, telle que la consomme la topologie. */
export interface DependencyEdge {
  deviceId: string;
  dependsOnId: string;
}

export function isUsedByCorrelation(dependency: Dependency): boolean {
  return dependency.status === 'validated';
}

export function validatedEdges(dependencies: Dependency[]): DependencyEdge[] {
  return dependencies.filter(isUsedByCorrelation);
}
