import type { IdGenerator } from '../../src/application/ports/system.js';

/** Les dépôts en mémoire font partie de l'application (STORAGE=memory) : les tests les réutilisent. */
export * from '../../src/infrastructure/persistence/memory/in-memory-repositories.js';

/** Identifiants lisibles pour les assertions (`id-1`, `id-2`…). */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}
