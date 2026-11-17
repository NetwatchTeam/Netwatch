export const config = {
  /** Même origine en production ; en développement, le proxy Vite relaie vers l'API. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  refreshIntervalMs: Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 30_000,
  requestTimeoutMs: 190_000,
};
