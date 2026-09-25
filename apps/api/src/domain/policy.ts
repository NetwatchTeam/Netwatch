/** Seuils métier configurables par le client. Chaque règle de détection les reçoit en paramètre. */
export interface MonitoringPolicy {
  scanIntervalMinutes: number;
  missedScansBeforeIncident: number;
  tlsWarningDays: number;
  watchedPorts: number[];
  throughputDropPercent: number;
  throughputFloorMbps: number;
  retentionDays: number;
}

export const DEFAULT_POLICY: MonitoringPolicy = {
  scanIntervalMinutes: 5,
  missedScansBeforeIncident: 1,
  tlsWarningDays: 30,
  watchedPorts: [21, 23, 25, 110, 143, 445, 1433, 3306, 3389, 5432, 5900],
  throughputDropPercent: 40,
  throughputFloorMbps: 10,
  retentionDays: 180,
};
