import type { DependencyEdge } from '../entities/dependency.js';
import { isOffline, type Device } from '../entities/device.js';

/**
 * Qui passe par qui, d'après les dépendances **validées** (voir entities/dependency.ts) :
 * ce que le collecteur déduit n'est qu'une suggestion tant qu'un humain ne l'a pas validée.
 * Construite à partir de l'état du parc après un scan, y compris pour les machines qui n'ont
 * pas répondu.
 */
export class Topology {
  private readonly byId: Map<string, Device>;
  private readonly upstreamsById = new Map<string, Device[]>();
  private readonly dependentsById = new Map<string, Device[]>();

  constructor(devices: Device[], edges: DependencyEdge[] = []) {
    this.byId = new Map(devices.map((device) => [device.id, device]));
    for (const edge of edges) {
      const device = this.byId.get(edge.deviceId);
      const upstream = this.byId.get(edge.dependsOnId);
      if (!device || !upstream || device.id === upstream.id) continue;
      push(this.upstreamsById, device.id, upstream);
      push(this.dependentsById, upstream.id, device);
    }
  }

  /** Équipements dont la machine dépend (en pratique : sa passerelle). */
  upstreamsOf(device: Device): Device[] {
    return (this.upstreamsById.get(device.id) ?? []).map((upstream) => this.byId.get(upstream.id) ?? upstream);
  }

  /**
   * La passerelle à retenir pour expliquer l'état de la machine : celle qui est hors service
   * s'il y en a une, sinon la première. `null` si la machine ne dépend de rien.
   */
  gatewayOf(device: Device): Device | null {
    const upstreams = this.upstreamsOf(device);
    return upstreams.find((upstream) => isOffline(upstream.reachability)) ?? upstreams[0] ?? null;
  }

  /** Machines qui passent par cet équipement. Vide pour une machine qui n'est la passerelle de personne. */
  dependentsOf(device: Device): Device[] {
    return (this.dependentsById.get(device.id) ?? []).map((dependent) => this.byId.get(dependent.id) ?? dependent);
  }

  isGateway(device: Device): boolean {
    return this.dependentsOf(device).length > 0;
  }

  /**
   * Requalifie les machines hors service : si l'un des équipements dont elles dépendent est
   * lui-même hors service, elles sont `unreachable` (coupées du réseau) et non `down` (en panne).
   * Une machine derrière une passerelle injoignable est injoignable à son tour.
   */
  static resolveReachability(devices: Device[], edges: DependencyEdge[] = []): Device[] {
    const topology = new Topology(devices, edges);
    return devices.map((device) => {
      if (!isOffline(device.reachability)) return device;
      const cutOff = topology.upstreamsOf(device).some((upstream) => isOffline(upstream.reachability));
      return { ...device, reachability: cutOff ? 'unreachable' : 'down' };
    });
  }
}

function push(map: Map<string, Device[]>, key: string, device: Device): void {
  const list = map.get(key) ?? [];
  list.push(device);
  map.set(key, list);
}
