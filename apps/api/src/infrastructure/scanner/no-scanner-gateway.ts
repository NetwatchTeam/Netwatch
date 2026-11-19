import type { ScanSnapshot, ScannerGateway } from '../../application/ports/scanner-gateway.js';
import { ScannerUnavailableError } from '../../domain/errors.js';

/**
 * SCANNER_MODE=none : aucun collecteur. Les données n'arrivent que par injection
 * (`npm run scan:inject`), ce qui permet de rejouer un jeu de données fictif sans qu'un
 * scan automatique vienne le mélanger à un autre réseau.
 */
export class NoScannerGateway implements ScannerGateway {
  async fetchSnapshot(): Promise<ScanSnapshot> {
    throw new ScannerUnavailableError(
      'Aucun collecteur configuré (SCANNER_MODE=none) : les données arrivent par injection, avec npm run scan:inject.',
    );
  }
}
