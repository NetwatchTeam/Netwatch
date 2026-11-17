import type { DeviceObservation } from '../../domain/entities/device.js';
import type { ThroughputObservation } from '../../domain/entities/measurement.js';

/**
 * Photographie du réseau renvoyée par le scanner à chaque interrogation.
 * Contrat détaillé (JSON) : docs/scanner-contract.md
 */
export interface ScanSnapshot {
  scannedAt: Date;
  devices: DeviceObservation[];
  throughput: ThroughputObservation[];
}

export interface ScannerGateway {
  /** Lève `ScannerUnavailableError` si le scanner ne répond pas ou renvoie un JSON invalide. */
  fetchSnapshot(): Promise<ScanSnapshot>;
}
