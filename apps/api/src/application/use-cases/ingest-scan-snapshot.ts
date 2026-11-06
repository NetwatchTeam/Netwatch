import {
  applyMiss,
  applyObservation,
  createDiscoveredDevice,
  type Device,
  type DeviceObservation,
} from '../../domain/entities/device.js';
import { validatedEdges } from '../../domain/entities/dependency.js';
import type { ThroughputSample } from '../../domain/entities/measurement.js';
import { openEvent, resolveEvent, type MonitoringEvent } from '../../domain/entities/monitoring-event.js';
import { applySync, syncDiscoveredDependencies } from '../../domain/rules/dependency-graph.js';
import { detectDiscovery } from '../../domain/rules/discovery.js';
import { detectExposedPorts } from '../../domain/rules/exposed-ports.js';
import type { DetectionIntent } from '../../domain/rules/intents.js';
import { detectPacketLoss } from '../../domain/rules/packet-loss.js';
import { DOWNSTREAM_KEY, detectDownstreamOutage, detectReachabilityChange } from '../../domain/rules/reachability.js';
import { detectResourceSaturation } from '../../domain/rules/resources.js';
import { detectThroughputDegradation } from '../../domain/rules/throughput.js';
import { detectTlsExpiry } from '../../domain/rules/tls-expiry.js';
import { detectTlsValidity } from '../../domain/rules/tls-validity.js';
import { Topology } from '../../domain/rules/topology.js';
import type { MonitoringPolicy } from '../../domain/policy.js';
import type { ScanSnapshot } from '../ports/scanner-gateway.js';
import type {
  DependencyRepository,
  DeviceRepository,
  EventRepository,
  PolicyRepository,
  ThroughputRepository,
} from '../ports/repositories.js';
import type { IdGenerator } from '../ports/system.js';

export interface IngestResult {
  devicesSeen: number;
  devicesDiscovered: number;
  eventsOpened: number;
  eventsResolved: number;
}

/** Fenêtre glissante servant de référence au calcul du débit habituel. */
const BASELINE_WINDOW_DAYS = 7;

/**
 * Cœur de l'application : transforme une photographie du réseau en
 * changements d'état et en événements. Toutes les décisions viennent
 * des règles du domaine ; ce cas d'usage ne fait qu'orchestrer.
 */
export class IngestScanSnapshot {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly events: EventRepository,
    private readonly throughput: ThroughputRepository,
    private readonly policies: PolicyRepository,
    private readonly ids: IdGenerator,
    private readonly dependencies: DependencyRepository,
  ) {}

  async execute(snapshot: ScanSnapshot): Promise<IngestResult> {
    const policy = await this.policies.get();
    const known = await this.devices.findAll();
    const openEvents = await this.events.findOpen();
    const knownDependencies = await this.dependencies.list();

    const byMac = new Map(known.filter((d) => d.mac).map((d) => [normalizeMac(d.mac!), d]));
    const byIp = new Map(known.map((d) => [d.ip, d]));
    const openByDevice = groupOpenEvents(openEvents);

    const touched = new Map<string, Device>();
    /** État de chaque machine avant ce scan ; absent pour une machine découverte à l'instant. */
    const befores = new Map<string, Device>();
    const intents: DetectionIntent[] = [];
    const seenIds = new Set<string>();
    let devicesDiscovered = 0;

    for (const observation of snapshot.devices) {
      const existing = matchDevice(observation, byMac, byIp);
      const before = existing ?? null;
      let after: Device;

      if (before === null) {
        after = createDiscoveredDevice(this.ids.next(), observation, snapshot.scannedAt);
        devicesDiscovered += 1;
        byIp.set(after.ip, after);
        if (after.mac) byMac.set(normalizeMac(after.mac), after);
      } else {
        after = applyObservation(before, observation, snapshot.scannedAt);
      }

      seenIds.add(after.id);
      touched.set(after.id, after);
      if (before !== null) befores.set(after.id, before);

      const keys = openByDevice.get(after.id) ?? new Set<string>();
      intents.push(...detectDiscovery(after, keys, snapshot.scannedAt));
      intents.push(...detectExposedPorts(after, keys, policy, snapshot.scannedAt));
      intents.push(...detectTlsExpiry(after, keys, policy, snapshot.scannedAt));
      intents.push(...detectTlsValidity(after, keys, snapshot.scannedAt));
      intents.push(...detectPacketLoss(after, keys, policy, snapshot.scannedAt));
      intents.push(...detectResourceSaturation(after, keys, policy, snapshot.scannedAt));
    }

    // Les machines connues absentes du scan sont candidates à un incident.
    for (const device of known) {
      if (seenIds.has(device.id)) continue;
      touched.set(device.id, applyMiss(device, snapshot.scannedAt, policy.missedScansBeforeIncident));
      befores.set(device.id, device);
    }

    // Les passerelles vues par le collecteur deviennent des suggestions de dépendance.
    // Elles n'influencent la corrélation qu'une fois validées par un humain.
    const parc = [...touched.values()];
    const dependencySync = syncDiscoveredDependencies(
      parc.filter((device) => seenIds.has(device.id)),
      parc,
      knownDependencies,
      snapshot.scannedAt,
      () => this.ids.next(),
    );
    const edges = validatedEdges(applySync(knownDependencies, dependencySync));

    // Une fois l'état de tout le parc connu : une machine muette derrière une passerelle
    // muette est « injoignable », pas « en panne ». Les pannes se décident ensuite.
    const resolvedDevices = Topology.resolveReachability(parc, edges);
    for (const device of resolvedDevices) touched.set(device.id, device);
    const topology = new Topology(resolvedDevices, edges);

    for (const after of resolvedDevices) {
      const keys = openByDevice.get(after.id) ?? new Set<string>();
      // Une machine découverte à l'instant répond forcément : rien à décider pour elle.
      if (befores.has(after.id)) {
        intents.push(...detectReachabilityChange(after, keys, snapshot.scannedAt, topology));
      }
      if (topology.isGateway(after) || keys.has(DOWNSTREAM_KEY)) {
        intents.push(...detectDownstreamOutage(after, keys, snapshot.scannedAt, topology));
      }
    }

    const samples = await this.handleThroughput(snapshot, byIp, touched, openByDevice, policy, intents);

    await this.devices.saveMany([...touched.values()]);
    // Après les machines : une suggestion peut viser une machine découverte à ce scan.
    if (dependencySync.inserted.length > 0) await this.dependencies.insertMany(dependencySync.inserted);
    if (dependencySync.updated.length > 0) await this.dependencies.saveMany(dependencySync.updated);
    if (dependencySync.deleted.length > 0) await this.dependencies.deleteMany(dependencySync.deleted.map((d) => d.id));
    if (samples.length > 0) await this.throughput.insertMany(samples);

    const { opened, resolved } = await this.applyIntents(intents, openEvents);

    return {
      devicesSeen: snapshot.devices.length,
      devicesDiscovered,
      eventsOpened: opened,
      eventsResolved: resolved,
    };
  }

  private async handleThroughput(
    snapshot: ScanSnapshot,
    byIp: Map<string, Device>,
    touched: Map<string, Device>,
    openByDevice: Map<string, Set<string>>,
    policy: MonitoringPolicy,
    intents: DetectionIntent[],
  ): Promise<ThroughputSample[]> {
    if (snapshot.throughput.length === 0) return [];

    const at = snapshot.scannedAt;
    const since = new Date(at.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const samples: ThroughputSample[] = [];

    for (const observation of snapshot.throughput) {
      const source = resolveDevice(observation.sourceIp, byIp, touched);
      if (!source) continue;
      const target = observation.targetIp ? resolveDevice(observation.targetIp, byIp, touched) ?? null : null;

      samples.push({
        id: this.ids.next(),
        sourceDeviceId: source.id,
        targetDeviceId: target?.id ?? null,
        mbps: observation.mbps,
        measuredAt: at,
      });

      const baselineMbps = await this.throughput.baseline(source.id, target?.id ?? null, since);
      const keys = openByDevice.get(source.id) ?? new Set<string>();
      intents.push(
        ...detectThroughputDegradation({ source, target, mbps: observation.mbps, baselineMbps }, keys, policy, at),
      );
    }

    return samples;
  }

  /** Traduit les intentions des règles en écritures : ouverture, mise à jour, résolution. */
  private async applyIntents(
    intents: DetectionIntent[],
    openEvents: MonitoringEvent[],
  ): Promise<{ opened: number; resolved: number }> {
    const openIndex = new Map(openEvents.map((event) => [`${event.deviceId}|${event.dedupeKey}`, event]));
    const toInsert: MonitoringEvent[] = [];
    const toUpdate: MonitoringEvent[] = [];
    let resolved = 0;

    for (const intent of intents) {
      if (intent.action === 'open') {
        const key = `${intent.event.deviceId}|${intent.event.dedupeKey}`;
        if (openIndex.has(key)) continue;
        const event = openEvent(this.ids.next(), intent.event);
        openIndex.set(key, event);
        toInsert.push(event);
        continue;
      }

      const existing = openIndex.get(`${intent.deviceId}|${intent.dedupeKey}`);
      if (!existing) continue;

      if (intent.action === 'update') {
        toUpdate.push({
          ...existing,
          severity: intent.severity,
          summary: intent.summary,
          details: intent.details,
          peerDeviceId: intent.peerDeviceId === undefined ? existing.peerDeviceId : intent.peerDeviceId,
        });
      } else {
        toUpdate.push(resolveEvent(existing, intent.at));
        resolved += 1;
      }
    }

    if (toInsert.length > 0) await this.events.insertMany(toInsert);
    for (const event of toUpdate) await this.events.save(event);

    return { opened: toInsert.length, resolved };
  }
}

/** Renvoie la version à jour de l'équipement si le scan vient de la modifier. */
function resolveDevice(
  ip: string,
  byIp: Map<string, Device>,
  touched: Map<string, Device>,
): Device | undefined {
  const known = byIp.get(ip);
  return known ? (touched.get(known.id) ?? known) : undefined;
}

function normalizeMac(mac: string): string {
  return mac.toLowerCase().replaceAll('-', ':');
}

/** Une machine est reconnue par son adresse MAC ; à défaut par son IP. */
function matchDevice(
  observation: DeviceObservation,
  byMac: Map<string, Device>,
  byIp: Map<string, Device>,
): Device | undefined {
  if (observation.mac) {
    const found = byMac.get(normalizeMac(observation.mac));
    if (found) return found;
  }
  return byIp.get(observation.ip);
}

function groupOpenEvents(events: MonitoringEvent[]): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const event of events) {
    const keys = grouped.get(event.deviceId) ?? new Set<string>();
    keys.add(event.dedupeKey);
    grouped.set(event.deviceId, keys);
  }
  return grouped;
}
