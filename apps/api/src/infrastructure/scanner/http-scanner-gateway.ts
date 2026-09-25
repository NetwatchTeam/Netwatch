import type { ScanSnapshot, ScannerGateway } from '../../application/ports/scanner-gateway.js';
import { ScannerUnavailableError } from '../../domain/errors.js';
import { snapshotSchema, toDomainSnapshot } from './snapshot-schema.js';

export interface HttpScannerOptions {
  baseUrl: string;
  token?: string | undefined;
  timeoutMs: number;
}

/** Adaptateur du scanner réseau : c'est le seul endroit qui connaît son protocole. */
export class HttpScannerGateway implements ScannerGateway {
  constructor(private readonly options: HttpScannerOptions) {}

  async fetchSnapshot(): Promise<ScanSnapshot> {
    const url = new URL('/scan', this.options.baseUrl).toString();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(this.options.timeoutMs) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ScannerUnavailableError(`Scanner injoignable (${url}) : ${reason}`);
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
