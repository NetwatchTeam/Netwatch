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

/** L'opération contredit l'état existant (ex. une dépendance qui créerait un cycle). */
export class ConflictError extends DomainError {}
