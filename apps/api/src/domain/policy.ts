/** Seuils métier configurables par le client. Chaque règle de détection les reçoit en paramètre. */
export interface MonitoringPolicy {
  scanIntervalMinutes: number;
  missedScansBeforeIncident: number;
  tlsWarningDays: number;
  watchedPorts: number[];
  throughputDropPercent: number;
  throughputFloorMbps: number;
  /** Perte de paquets (%) à partir de laquelle une observation est ouverte. */
  packetLossWarningPercent: number;
  /** Charges (%) à partir desquelles une saturation est signalée. */
  cpuWarningPercent: number;
  memoryWarningPercent: number;
  diskWarningPercent: number;
  retentionDays: number;
}

export const DEFAULT_POLICY: MonitoringPolicy = {
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
