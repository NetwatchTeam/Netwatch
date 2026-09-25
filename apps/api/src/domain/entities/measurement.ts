/** Mesure de débit entre deux machines, ou débit observé d'une machine si `targetDeviceId` est nul. */
export interface ThroughputSample {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string | null;
  mbps: number;
  measuredAt: Date;
}

export interface ThroughputObservation {
  sourceIp: string;
  targetIp: string | null;
  mbps: number;
}

export type ScanRunStatus = 'running' | 'succeeded' | 'failed';

/** Trace d'une interrogation du scanner : sert à détecter un scanner muet. */
export interface ScanRun {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: ScanRunStatus;
  devicesSeen: number;
  eventsRaised: number;
  error: string | null;
}
