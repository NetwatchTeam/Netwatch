/**
 * Réglages de supervision, modifiables par le client sans redéploiement.
 * Ces valeurs sont les seuils utilisés par les règles métier.
 */
export interface MonitoringSettingsDto {
  /** Intervalle entre deux interrogations du scanner, en minutes. */
  scanIntervalMinutes: number;
  /** Nombre de scans sans réponse avant de déclarer un incident. */
  missedScansBeforeIncident: number;
  /** Préavis d'expiration d'un certificat TLS, en jours. */
  tlsWarningDays: number;
  /** Ports considérés comme sensibles s'ils sont ouverts. */
  watchedPorts: number[];
  /** Baisse de débit, en pourcentage de la référence, déclenchant une observation. */
  throughputDropPercent: number;
  /** Débit en dessous duquel une mesure est signalée quelle que soit la référence, en Mbit/s. */
  throughputFloorMbps: number;
  /** Perte de paquets, en pourcentage, à partir de laquelle une observation est ouverte. */
  packetLossWarningPercent: number;
  /** Charge processeur, en pourcentage, à partir de laquelle une saturation est signalée. */
  cpuWarningPercent: number;
  /** Occupation mémoire, en pourcentage, à partir de laquelle une saturation est signalée. */
  memoryWarningPercent: number;
  /** Occupation d'un disque, en pourcentage, à partir de laquelle une saturation est signalée. */
  diskWarningPercent: number;
  /** Durée de conservation des mesures et des événements résolus, en jours. */
  retentionDays: number;
}

export type UpdateMonitoringSettingsInput = Partial<MonitoringSettingsDto>;

export const DEFAULT_MONITORING_SETTINGS: MonitoringSettingsDto = {
  scanIntervalMinutes: 5,
  missedScansBeforeIncident: 1,
  tlsWarningDays: 30,
  watchedPorts: [21, 23, 25, 110, 143, 445, 1433, 3306, 3389, 5432, 5900],
  throughputDropPercent: 40,
  throughputFloorMbps: 10,
  packetLossWarningPercent: 5,
  cpuWarningPercent: 90,
  memoryWarningPercent: 90,
  diskWarningPercent: 90,
  retentionDays: 180,
};
