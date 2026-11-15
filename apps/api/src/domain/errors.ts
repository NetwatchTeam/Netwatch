import type { Device } from './entities/device.js';

/** Erreur métier : le nom sert à choisir le code HTTP dans la couche interface. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {}

export class ValidationError extends DomainError {}

export class ScannerUnavailableError extends DomainError {}

/** Action refusée par la configuration de l'instance (ex. injection de scans en production). */
export class ForbiddenError extends DomainError {}

/** L'opération contredit l'état existant (ex. une dépendance qui créerait un cycle). */
export class ConflictError extends DomainError {}

/** Un équipement est déjà connu à cette IP ou cette MAC : on le signale plutôt que de créer un doublon. */
export class DuplicateDeviceError extends ConflictError {
  constructor(
    message: string,
    readonly existing: Device,
    readonly matchedOn: Array<'ip' | 'mac'>,
  ) {
    super(message);
  }
}
