import type { ScanRun } from '../../domain/entities/measurement.js';
import type { ScannerGateway } from '../ports/scanner-gateway.js';
import type { ScanRunRepository } from '../ports/repositories.js';
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
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<ScanRun> {
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
      const snapshot = await this.scanner.fetchSnapshot();
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
