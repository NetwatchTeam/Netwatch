import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'netwatch.author';

function readStoredAuthor(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Stockage indisponible (navigation privée, cookies bloqués) : on redemandera le nom.
    return '';
  }
}

/**
 * Un seul nom pour toute l'application : le saisir dans un champ le remplit dans tous les autres
 * (en haut de la page « À valider » comme sur chaque carte).
 */
let current = readStoredAuthor();
const listeners = new Set<() => void>();

function setAuthor(value: string): void {
  current = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value.trim());
  } catch {
    // Sans stockage, le nom vaut pour la page ouverte.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Nom de la personne qui agit, enregistré avec chaque décision sur un équipement.
 * NetWatch n'a pas de connexion : le nom est déclaré une fois puis mémorisé dans ce navigateur.
 */
export function useAuthor(): [string, (author: string) => void] {
  const author = useSyncExternalStore(subscribe, () => current);
  return [author, setAuthor];
}
