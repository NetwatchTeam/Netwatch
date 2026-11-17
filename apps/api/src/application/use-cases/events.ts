import { acknowledgeEvent, releaseEvent, type MonitoringEvent } from '../../domain/entities/monitoring-event.js';
import { NotFoundError, ValidationError } from '../../domain/errors.js';
import type { EventQuery, EventRepository } from '../ports/repositories.js';
import type { Clock } from '../ports/system.js';

export class ListEvents {
  constructor(private readonly events: EventRepository) {}

  execute(query: EventQuery = {}): Promise<MonitoringEvent[]> {
    return this.events.list(query);
  }
}

/** Tout ce qui n'est pas résolu : ouvert ou pris en charge. */
export class ListOpenEvents {
  constructor(private readonly events: EventRepository) {}

  execute(): Promise<MonitoringEvent[]> {
    return this.events.findOpen();
  }
}

/** Le technicien indique qu'il a pris l'événement en charge ; la cause, elle, reste active. */
export class AcknowledgeEvent {
  constructor(
    private readonly events: EventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<MonitoringEvent> {
    const event = await this.events.findById(id);
    if (!event) throw new NotFoundError(`Événement ${id} introuvable`);
    if (event.status === 'resolved') {
      throw new ValidationError('Un événement résolu ne peut plus être pris en charge');
    }

    const acknowledged = acknowledgeEvent(event, this.clock.now());
    await this.events.save(acknowledged);
    return acknowledged;
  }
}

/** Annule une prise en charge : l'événement redevient « ouvert ». */
export class ReleaseEvent {
  constructor(private readonly events: EventRepository) {}

  async execute(id: string): Promise<MonitoringEvent> {
    const event = await this.events.findById(id);
    if (!event) throw new NotFoundError(`Événement ${id} introuvable`);
    if (event.status !== 'acknowledged') {
      throw new ValidationError('Seul un événement pris en charge peut être remis à traiter');
    }

    const released = releaseEvent(event);
    await this.events.save(released);
    return released;
  }
}
