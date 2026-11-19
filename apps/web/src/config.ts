export const config = {
  /** Même origine en production ; en développement, le proxy Vite relaie vers l'API. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  refreshIntervalMs: Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 30_000,
  requestTimeoutMs: 15_000,
  /**
   * « Lancer un scan maintenant » attend la fin du scan : le collecteur peut mettre jusqu'à 5 minutes
   * (SCANNER_TIMEOUT_MS côté API), plus le temps d'enregistrer les résultats.
   */
  scanRequestTimeoutMs: 6 * 60_000,
};
