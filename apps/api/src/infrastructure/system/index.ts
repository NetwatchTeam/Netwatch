import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator, Logger } from '../../application/ports/system.js';

export const systemClock: Clock = {
  now: () => new Date(),
};

export const uuidGenerator: IdGenerator = {
  next: () => randomUUID(),
};

/** Journal au format JSON par ligne : lisible tel quel, exploitable par un collecteur. */
export function createLogger(service = 'netwatch-api'): Logger {
  const write = (level: string, message: string, meta?: Record<string, unknown>) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...meta,
    });
    if (level === 'error') console.error(line);
    else console.log(line);
  };

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}
