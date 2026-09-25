import type { Logger } from './application/ports/system.js';
import { ClassifyDevice, GetDevice, ListDevices } from './application/use-cases/devices.js';
import { AcknowledgeEvent, ListEvents, ListOpenEvents, ReleaseEvent } from './application/use-cases/events.js';
import { GenerateWeeklyReport } from './application/use-cases/generate-weekly-report.js';
import { GetNetworkSummary } from './application/use-cases/get-network-summary.js';
import { IngestScanSnapshot } from './application/use-cases/ingest-scan-snapshot.js';
import {
  GetSettings,
  GetThroughputHistory,
  ListScanRuns,
  PurgeExpiredData,
  UpdateSettings,
} from './application/use-cases/maintenance.js';
import { RunScan } from './application/use-cases/run-scan.js';
import type { Env } from './infrastructure/config/env.js';
import { PostgresDeviceRepository } from './infrastructure/persistence/postgres/device-repository.js';
import { PostgresEventRepository } from './infrastructure/persistence/postgres/event-repository.js';
import { PostgresPolicyRepository } from './infrastructure/persistence/postgres/policy-repository.js';
import { PostgresScanRunRepository } from './infrastructure/persistence/postgres/scan-run-repository.js';
import { PostgresThroughputRepository } from './infrastructure/persistence/postgres/throughput-repository.js';
import type { Database } from './infrastructure/persistence/postgres/pool.js';
import { DemoScannerGateway } from './infrastructure/scanner/demo-scanner-gateway.js';
import { HttpScannerGateway } from './infrastructure/scanner/http-scanner-gateway.js';
import { systemClock, uuidGenerator } from './infrastructure/system/index.js';

/** Cas d'usage exposés à la couche HTTP : c'est la seule surface qu'elle connaît. */
export interface AppContainer {
  listDevices: ListDevices;
  getDevice: GetDevice;
  classifyDevice: ClassifyDevice;
  listEvents: ListEvents;
  listOpenEvents: ListOpenEvents;
  acknowledgeEvent: AcknowledgeEvent;
  releaseEvent: ReleaseEvent;
  getNetworkSummary: GetNetworkSummary;
  generateWeeklyReport: GenerateWeeklyReport;
  getThroughputHistory: GetThroughputHistory;
  listScanRuns: ListScanRuns;
  getSettings: GetSettings;
  updateSettings: UpdateSettings;
  runScan: RunScan;
  purgeExpiredData: PurgeExpiredData;
}

/**
 * Racine de composition : le seul endroit où les implémentations concrètes
 * (PostgreSQL, scanner HTTP, horloge système) rencontrent les cas d'usage.
 */
export function buildContainer(db: Database, env: Env, logger: Logger): AppContainer {
  const devices = new PostgresDeviceRepository(db);
  const events = new PostgresEventRepository(db);
  const throughput = new PostgresThroughputRepository(db);
  const scanRuns = new PostgresScanRunRepository(db);
  const policies = new PostgresPolicyRepository(db);

  const scanner =
    env.SCANNER_MODE === 'http'
      ? new HttpScannerGateway({
          baseUrl: env.SCANNER_URL!,
          token: env.SCANNER_TOKEN,
          timeoutMs: env.SCANNER_TIMEOUT_MS,
        })
      : new DemoScannerGateway(systemClock);

  const ingest = new IngestScanSnapshot(devices, events, throughput, policies, uuidGenerator);

  return {
    listDevices: new ListDevices(devices),
    getDevice: new GetDevice(devices),
    classifyDevice: new ClassifyDevice(devices, events, systemClock),
    listEvents: new ListEvents(events),
    listOpenEvents: new ListOpenEvents(events),
    acknowledgeEvent: new AcknowledgeEvent(events, systemClock),
    releaseEvent: new ReleaseEvent(events),
    getNetworkSummary: new GetNetworkSummary(devices, events, throughput, scanRuns, policies, systemClock),
    generateWeeklyReport: new GenerateWeeklyReport(devices, events, throughput, systemClock),
    getThroughputHistory: new GetThroughputHistory(throughput),
    listScanRuns: new ListScanRuns(scanRuns),
    getSettings: new GetSettings(policies),
    updateSettings: new UpdateSettings(policies),
    runScan: new RunScan(scanner, ingest, scanRuns, uuidGenerator, systemClock, logger),
    purgeExpiredData: new PurgeExpiredData(events, throughput, policies, systemClock, logger),
  };
}
