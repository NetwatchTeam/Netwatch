/**
 * Version du contrat d'échange (collecteur ↔ API ↔ dashboard), au format MAJEUR.MINEUR.CORRECTIF.
 * - MINEUR : ajout rétrocompatible (nouveau champ facultatif, nouvelle route) ;
 * - MAJEUR : rupture (champ retiré ou renommé, sens modifié) → nouvelle base d'URL `/api/v2`.
 * Voir docs/api-contract.md, section « Versionnement ».
 */
export const CONTRACT_VERSION = '1.1.0';

/** En-tête HTTP portant la version du contrat, dans les deux sens. */
export const CONTRACT_VERSION_HEADER = 'X-NetWatch-Contract';

export * from './dependency.js';
export * from './device.js';
export * from './event.js';
export * from './report.js';
export * from './settings.js';

/** Enveloppe d'erreur renvoyée par l'API pour toute réponse 4xx/5xx. */
export interface ApiErrorDto {
  error: {
    code:
      | 'bad_request'
      | 'forbidden'
      | 'not_found'
      | 'conflict'
      | 'duplicate_device'
      | 'scanner_unavailable'
      | 'internal_error';
    message: string;
    details?: unknown;
  };
}
