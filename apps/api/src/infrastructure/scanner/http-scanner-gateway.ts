import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '@netwatch/contracts';
import type { ScanRequest, ScanSnapshot, ScannerGateway } from '../../application/ports/scanner-gateway.js';
import { ScannerUnavailableError } from '../../domain/errors.js';
import { snapshotSchema, toDomainSnapshot } from './snapshot-schema.js';

export interface HttpScannerOptions {
  baseUrl: string;
  token?: string | undefined;
  timeoutMs: number;
}

/** Codes réseau de Node, traduits pour la page « Scans » : `fetch failed` seul ne dit pas quoi corriger. */
const NETWORK_ERRORS: Record<string, string> = {
  ECONNREFUSED: 'connexion refusée — le scanner n’est pas démarré, ou n’écoute pas sur ce port',
  ENOTFOUND: 'nom d’hôte introuvable — vérifier SCANNER_URL',
  EAI_AGAIN: 'résolution DNS impossible pour le moment — vérifier SCANNER_URL et le réseau',
  ECONNRESET: 'connexion coupée par le scanner pendant la réponse',
  EHOSTUNREACH: 'machine du scanner inaccessible sur le réseau',
  ENETUNREACH: 'réseau du scanner inaccessible',
  ETIMEDOUT: 'la machine du scanner ne répond pas',
  UND_ERR_CONNECT_TIMEOUT: 'la machine du scanner ne répond pas',
  UND_ERR_SOCKET: 'connexion coupée par le scanner pendant la réponse',
};

export function explainFetchError(error: unknown, timeoutMs: number): string {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `pas de réponse en ${timeoutMs / 1000} s (SCANNER_TIMEOUT_MS)`;
  }
  // `fetch` enveloppe l'erreur réseau d'origine dans `cause`.
  const cause = error instanceof Error ? (error.cause as { code?: string; message?: string } | undefined) : undefined;
  const code = cause?.code;
  if (code && NETWORK_ERRORS[code]) return `${NETWORK_ERRORS[code]} (${code})`;
  if (code) return `${cause?.message ?? 'erreur réseau'} (${code})`;
  return error instanceof Error ? error.message : String(error);
}

/** Adaptateur du scanner réseau : c'est le seul endroit qui connaît son protocole. */
export class HttpScannerGateway implements ScannerGateway {
  constructor(private readonly options: HttpScannerOptions) {}

  async fetchSnapshot(request: ScanRequest = { targets: [] }): Promise<ScanSnapshot> {
    const target = new URL('/scan', this.options.baseUrl);
    // Équipements ajoutés à la main : le collecteur les sonde en plus de sa découverte (contrat 1.1).
    if (request.targets.length > 0) target.searchParams.set('targets', request.targets.join(','));
    const url = target.toString();
    // Le collecteur sait ainsi quelle version du contrat l'API attend.
    const headers: Record<string, string> = { Accept: 'application/json', [CONTRACT_VERSION_HEADER]: CONTRACT_VERSION };
    if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(this.options.timeoutMs) });
    } catch (error) {
      throw new ScannerUnavailableError(`Scanner injoignable (${url}) : ${explainFetchError(error, this.options.timeoutMs)}`);
    }

    if (!response.ok) {
      throw new ScannerUnavailableError(`Le scanner a répondu ${response.status} ${response.statusText}`);
    }

    const payload = await response.json().catch(() => {
      throw new ScannerUnavailableError('Le scanner n\'a pas renvoyé du JSON');
    });

    const parsed = snapshotSchema.safeParse(payload);
    if (!parsed.success) {
      const details = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(' ; ');
      throw new ScannerUnavailableError(`Réponse du scanner non conforme au contrat — ${details}`);
    }

    return toDomainSnapshot(parsed.data);
  }
}
