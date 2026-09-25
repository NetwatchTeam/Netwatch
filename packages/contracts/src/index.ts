export * from './auth.js';
export * from './device.js';
export * from './event.js';
export * from './report.js';
export * from './settings.js';

/** Enveloppe d'erreur renvoyée par l'API pour toute réponse 4xx/5xx. */
export interface ApiErrorDto {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'conflict'
      | 'scanner_unavailable'
      | 'internal_error';
    message: string;
    details?: unknown;
  };
}
