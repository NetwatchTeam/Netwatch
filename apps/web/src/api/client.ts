import type { ApiErrorDto } from '@netwatch/contracts';
import { config } from '../config';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Une 401 signifie que la session a expiré : l'application doit revenir
 * à l'écran de connexion sans attendre l'action de l'utilisateur.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => {};

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

export function toQuery(params: Record<string, string | number | boolean | undefined | null> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers,
      // Le jeton de session est un cookie httpOnly : il n'est jamais lisible en JavaScript.
      credentials: 'include',
      signal: controller.signal,
    });

    if (response.status === 401) {
      onUnauthorized();
      throw new ApiError(401, 'Session expirée, reconnectez-vous');
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorDto | null;
      throw new ApiError(response.status, payload?.error.message ?? response.statusText);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, "L'API ne répond pas (délai dépassé)");
    }
    throw new ApiError(0, "Impossible de joindre l'API NetWatch");
  } finally {
    clearTimeout(timeout);
  }
}
