import type { ScanRun } from '../../domain/entities/measurement.js';
import type { ScanSnapshot, ScannerGateway } from '../ports/scanner-gateway.js';
import type { DeviceRepository, ScanRunRepository } from '../ports/repositories.js';
import type { Clock, IdGenerator, Logger } from '../ports/system.js';
import type { IngestScanSnapshot } from './ingest-scan-snapshot.js';

/**
 * Une interrogation complète du scanner, tracée de bout en bout.
 * Un échec est enregistré et non propagé : le planificateur doit survivre
 * à un scanner momentanément injoignable, et le tableau de bord doit le voir.
 */
export class RunScan {
  constructor(
    private readonly scanner: ScannerGateway,
    private readonly ingest: IngestScanSnapshot,
    private readonly scanRuns: ScanRunRepository,
    private readonly devices: DeviceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<ScanRun> {
    return this.record(async () => {
      // Les équipements ajoutés à la main ne sont pas découverts seuls : le collecteur doit les sonder.
      const known = await this.devices.findAll({ lifecycle: 'active' });
      const targets = known.filter((device) => device.origin === 'manual').map((device) => device.ip);
      return this.scanner.fetchSnapshot({ targets });
    });
  }

  /**
   * Photographie fournie directement (jeu de données fictif injecté par `npm run scan:inject`) :
   * elle suit exactement le chemin d'un vrai scan, journal compris, sans interroger le collecteur.
   */
  async importSnapshot(snapshot: ScanSnapshot): Promise<ScanRun> {
    return this.record(async () => snapshot);
  }

  private async record(obtain: () => Promise<ScanSnapshot>): Promise<ScanRun> {
    const run: ScanRun = {
      id: this.ids.next(),
      startedAt: this.clock.now(),
      finishedAt: null,
      status: 'running',
      devicesSeen: 0,
      eventsRaised: 0,
      error: null,
    };
    await this.scanRuns.start(run);

    try {
      const snapshot = await obtain();
      const result = await this.ingest.execute(snapshot);
      const finished: ScanRun = {
        ...run,
        finishedAt: this.clock.now(),
        status: 'succeeded',
        devicesSeen: result.devicesSeen,
        eventsRaised: result.eventsOpened,
      };
      await this.scanRuns.finish(finished);
      this.logger.info('Scan terminé', { ...result });
      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: ScanRun = {
        ...run,
        finishedAt: this.clock.now(),
        status: 'failed',
        error: message,
      };
      await this.scanRuns.finish(failed);
      this.logger.error('Scan en échec', { error: message });
      return failed;
    }
  }
}
