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

export interface ScanRequest {
  /**
   * IP à sonder en plus de la découverte habituelle : les équipements ajoutés à la main,
   * que le collecteur ne trouverait pas seul. Un équipement muet est simplement absent de la réponse.
   */
  targets: string[];
}

export interface ScannerGateway {
  /** Lève `ScannerUnavailableError` si le scanner ne répond pas ou renvoie un JSON invalide. */
  fetchSnapshot(request?: ScanRequest): Promise<ScanSnapshot>;
}
