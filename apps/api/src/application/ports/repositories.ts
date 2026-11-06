import type { Dependency } from '../../domain/entities/dependency.js';
import type { Device, DeviceKind, DeviceLifecycle, DeviceReachability } from '../../domain/entities/device.js';
import type { ScanRun, ThroughputSample } from '../../domain/entities/measurement.js';
import type { EventCategory, EventStatus, EventType, MonitoringEvent } from '../../domain/entities/monitoring-event.js';
import type { MonitoringPolicy } from '../../domain/policy.js';

export interface DeviceQuery {
  q?: string;
  kind?: DeviceKind;
  lifecycle?: DeviceLifecycle;
  reachability?: DeviceReachability;
}

export interface DeviceRepository {
  /** Le parc visé (10 à 100 machines) tient en mémoire : le filtrage fin se fait côté base. */
  findAll(query?: DeviceQuery): Promise<Device[]>;
  findById(id: string): Promise<Device | null>;
  save(device: Device): Promise<void>;
  saveMany(devices: Device[]): Promise<void>;
}

export interface EventQuery {
  category?: EventCategory;
  status?: EventStatus;
  deviceId?: string;
  since?: Date;
  limit?: number;
}

export interface EventRepository {
  list(query?: EventQuery): Promise<MonitoringEvent[]>;
  findById(id: string): Promise<MonitoringEvent | null>;
  /** Événements non résolus, tous équipements confondus. */
  findOpen(): Promise<MonitoringEvent[]>;
  /** Événements d'un type donné chevauchant une période (pour les rapports). */
  findOverlapping(type: EventType, from: Date, to: Date): Promise<MonitoringEvent[]>;
  findStartedBetween(from: Date, to: Date): Promise<MonitoringEvent[]>;
  insertMany(events: MonitoringEvent[]): Promise<void>;
  save(event: MonitoringEvent): Promise<void>;
  deleteResolvedBefore(date: Date): Promise<number>;
}

export interface ThroughputRepository {
  insertMany(samples: ThroughputSample[]): Promise<void>;
  listBetween(from: Date, to: Date, deviceId?: string): Promise<ThroughputSample[]>;
  /** Moyenne de toutes les mesures d'une période, en Mbit/s. */
  averageBetween(from: Date, to: Date): Promise<number | null>;
  /** Débit habituel d'un trajet, utilisé comme référence par la règle de dégradation. */
  baseline(sourceDeviceId: string, targetDeviceId: string | null, since: Date): Promise<number | null>;
  deleteBefore(date: Date): Promise<number>;
}

export interface ScanRunRepository {
  start(run: ScanRun): Promise<void>;
  finish(run: ScanRun): Promise<void>;
  last(): Promise<ScanRun | null>;
  list(limit: number): Promise<ScanRun[]>;
}

export interface DependencyRepository {
  /** Le graphe complet : au plus quelques centaines de liens pour le parc visé. */
  list(): Promise<Dependency[]>;
  findById(id: string): Promise<Dependency | null>;
  insertMany(dependencies: Dependency[]): Promise<void>;
  saveMany(dependencies: Dependency[]): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
}

export interface PolicyRepository {
  get(): Promise<MonitoringPolicy>;
  update(patch: Partial<MonitoringPolicy>): Promise<MonitoringPolicy>;
}
