import type { ApiErrorDto } from '@netwatch/contracts';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../../../application/ports/system.js';
import { NotFoundError, ScannerUnavailableError, ValidationError } from '../../../domain/errors.js';

/** Traduction des erreurs métier en codes HTTP : le domaine ignore tout du protocole. */
export function errorHandler(logger: Logger) {
  return (error: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const body = (status: number, payload: ApiErrorDto) => res.status(status).json(payload);

    if (error instanceof ZodError) {
      body(400, {
        error: {
          code: 'bad_request',
          message: 'Requête invalide',
          details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      });
      return;
    }

    if (error instanceof ValidationError) {
      body(400, { error: { code: 'bad_request', message: error.message } });
      return;
    }

    if (error instanceof NotFoundError) {
      body(404, { error: { code: 'not_found', message: error.message } });
      return;
    }

    if (error instanceof ScannerUnavailableError) {
      body(502, { error: { code: 'scanner_unavailable', message: error.message } });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error('Erreur non gérée', { message });
    body(500, { error: { code: 'internal_error', message: 'Erreur interne' } });
  };
}
