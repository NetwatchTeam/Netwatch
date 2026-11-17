import type { Logger } from '../../application/ports/system.js';
import type { GetSettings, PurgeExpiredData } from '../../application/use-cases/maintenance.js';
import type { RunScan } from '../../application/use-cases/run-scan.js';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Déclenche les scans au rythme défini dans les réglages (5 minutes par défaut).
 * L'intervalle est relu à chaque tour : un changement depuis l'interface
 * s'applique sans redémarrer le service.
 */
export class ScanScheduler {
  private timer: NodeJS.Timeout | null = null;
  private purgeTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly runScan: RunScan,
    private readonly purge: PurgeExpiredData,
    private readonly settings: GetSettings,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.stopped = false;
    void this.tick();
    this.purgeTimer = setInterval(() => {
      void this.purge.execute().catch((error: unknown) => {
        this.logger.error('Purge en échec', { error: String(error) });
      });
    }, PURGE_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.timer = null;
    this.purgeTimer = null;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;

    this.running = true;
    try {
      await this.runScan.execute();
    } catch (error) {
      // RunScan encaisse déjà ses erreurs ; ce filet protège le planificateur.
      this.logger.error('Cycle de scan interrompu', { error: String(error) });
    } finally {
      this.running = false;
    }

    if (this.stopped) return;

    const { scanIntervalMinutes } = await this.settings.execute().catch(() => ({ scanIntervalMinutes: 5 }));
    const delay = Math.max(1, scanIntervalMinutes) * 60_000;
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref?.();
  }
}
