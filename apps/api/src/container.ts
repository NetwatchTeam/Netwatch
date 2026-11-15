import type {
  DependencyRepository,
  DeviceDecisionRepository,
  DeviceRepository,
  EventRepository,
  PolicyRepository,
  ScanRunRepository,
  ThroughputRepository,
} from './application/ports/repositories.js';
import type { ScannerGateway } from './application/ports/scanner-gateway.js';
import type { Clock, IdGenerator, Logger } from './application/ports/system.js';
import {
  CreateDependency,
  DeleteDependency,
  GetTopology,
  ListDependencies,
  UpdateDependency,
  ValidateAllSuggestions,
} from './application/use-cases/dependencies.js';
import {
  ClassifyDevice,
  CreateDevice,
  GetDevice,
  ListDeviceDecisions,
  ListDevices,
  ValidateAllPending,
} from './application/use-cases/devices.js';
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
import { inMemoryRepositories } from './infrastructure/persistence/memory/in-memory-repositories.js';
import { PostgresDependencyRepository } from './infrastructure/persistence/postgres/dependency-repository.js';
import { PostgresDeviceDecisionRepository } from './infrastructure/persistence/postgres/device-decision-repository.js';
import { PostgresDeviceRepository } from './infrastructure/persistence/postgres/device-repository.js';
import { PostgresEventRepository } from './infrastructure/persistence/postgres/event-repository.js';
import { PostgresPolicyRepository } from './infrastructure/persistence/postgres/policy-repository.js';
import { PostgresScanRunRepository } from './infrastructure/persistence/postgres/scan-run-repository.js';
import { PostgresThroughputRepository } from './infrastructure/persistence/postgres/throughput-repository.js';
import type { Database } from './infrastructure/persistence/postgres/pool.js';
import { DemoScannerGateway } from './infrastructure/scanner/demo-scanner-gateway.js';
import { HttpScannerGateway } from './infrastructure/scanner/http-scanner-gateway.js';
import { NoScannerGateway } from './infrastructure/scanner/no-scanner-gateway.js';
import { systemClock, uuidGenerator } from './infrastructure/system/index.js';

/** Cas d'usage exposés à la couche HTTP : c'est la seule surface qu'elle connaît. */
export interface AppContainer {
  listDevices: ListDevices;
  getDevice: GetDevice;
  classifyDevice: ClassifyDevice;
  createDevice: CreateDevice;
  listDeviceDecisions: ListDeviceDecisions;
  validateAllPending: ValidateAllPending;
  getTopology: GetTopology;
  listDependencies: ListDependencies;
  createDependency: CreateDependency;
  updateDependency: UpdateDependency;
  deleteDependency: DeleteDependency;
  validateAllSuggestions: ValidateAllSuggestions;
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

export interface Repositories {
  devices: DeviceRepository;
  decisions: DeviceDecisionRepository;
  events: EventRepository;
  throughput: ThroughputRepository;
  scanRuns: ScanRunRepository;
  policies: PolicyRepository;
  dependencies: DependencyRepository;
}

export interface Runtime {
  scanner: ScannerGateway;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
}

/**
 * Assemble les cas d'usage à partir de dépôts et d'une passerelle scanner quelconques :
 * PostgreSQL en production, mémoire dans les tests et pour générer les exemples du contrat.
 */
export function buildUseCases(repos: Repositories, runtime: Runtime): AppContainer {
  const { devices, decisions, events, throughput, scanRuns, policies, dependencies } = repos;
  const { scanner, clock, ids, logger } = runtime;
  const ingest = new IngestScanSnapshot(devices, events, throughput, policies, ids, dependencies);
  const classifyDevice = new ClassifyDevice(devices, events, decisions, clock, ids);

  return {
    listDevices: new ListDevices(devices),
    getDevice: new GetDevice(devices),
    classifyDevice,
    validateAllPending: new ValidateAllPending(devices, classifyDevice),
    createDevice: new CreateDevice(devices, events, decisions, clock, ids),
    listDeviceDecisions: new ListDeviceDecisions(decisions),
    getTopology: new GetTopology(dependencies, devices),
    listDependencies: new ListDependencies(dependencies, devices),
    createDependency: new CreateDependency(dependencies, devices, clock, ids),
    updateDependency: new UpdateDependency(dependencies, devices, clock),
    deleteDependency: new DeleteDependency(dependencies, clock),
    validateAllSuggestions: new ValidateAllSuggestions(dependencies, clock),
    listEvents: new ListEvents(events),
    listOpenEvents: new ListOpenEvents(events),
    acknowledgeEvent: new AcknowledgeEvent(events, clock),
    releaseEvent: new ReleaseEvent(events),
    getNetworkSummary: new GetNetworkSummary(devices, events, throughput, scanRuns, policies, clock),
    generateWeeklyReport: new GenerateWeeklyReport(devices, events, throughput, clock),
    getThroughputHistory: new GetThroughputHistory(throughput),
    listScanRuns: new ListScanRuns(scanRuns),
    getSettings: new GetSettings(policies),
    updateSettings: new UpdateSettings(policies),
    runScan: new RunScan(scanner, ingest, scanRuns, devices, ids, clock, logger),
    purgeExpiredData: new PurgeExpiredData(events, throughput, policies, clock, logger),
  };
}

/**
 * Racine de composition : le seul endroit où les implémentations concrètes
 * (PostgreSQL, scanner HTTP, horloge système) rencontrent les cas d'usage.
 */
function scannerFor(env: Env): ScannerGateway {
  if (env.SCANNER_MODE === 'none') return new NoScannerGateway();
  return env.SCANNER_MODE === 'http'
    ? new HttpScannerGateway({
        baseUrl: env.SCANNER_URL!,
        token: env.SCANNER_TOKEN,
        timeoutMs: env.SCANNER_TIMEOUT_MS,
      })
    : new DemoScannerGateway(systemClock);
}

/** Sans base de données (`STORAGE=memory`) : les données vivent le temps du processus. */
export function buildInMemoryContainer(env: Env, logger: Logger): AppContainer {
  return buildUseCases(inMemoryRepositories(), { scanner: scannerFor(env), clock: systemClock, ids: uuidGenerator, logger });
}

export function buildContainer(db: Database, env: Env, logger: Logger): AppContainer {
  const scanner = scannerFor(env);

  return buildUseCases(
    {
      devices: new PostgresDeviceRepository(db),
      decisions: new PostgresDeviceDecisionRepository(db),
      events: new PostgresEventRepository(db),
      throughput: new PostgresThroughputRepository(db),
      scanRuns: new PostgresScanRunRepository(db),
      policies: new PostgresPolicyRepository(db),
      dependencies: new PostgresDependencyRepository(db),
    },
    { scanner, clock: systemClock, ids: uuidGenerator, logger },
  );
}
