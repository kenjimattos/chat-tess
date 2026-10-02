import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, type AppErrorKind } from '../shared/errors/app-error';
import type { Logger } from '../infra/logging/logger';

const HTTP_STATUS_BY_KIND: Record<AppErrorKind, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  limit_exceeded: 429,
};

export interface ErrorResponseBody {
  error: { code: string; message: string; details?: unknown };
}

export const apiNotFoundHandler: RequestHandler = (request, response) => {
  const body: ErrorResponseBody = {
    error: {
      code: 'route_not_found',
      message: `Rota não encontrada: ${request.method} ${request.originalUrl}`,
    },
  };
  response.status(404).json(body);
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const { status, body } = toErrorResponse(error);
    if (status >= 500) {
      logger.error({ err: error }, 'Erro inesperado ao processar a requisição');
    }
    response.status(status).json(body);
  };
}

function toErrorResponse(error: unknown): { status: number; body: ErrorResponseBody } {
  if (error instanceof AppError) {
    return {
      status: HTTP_STATUS_BY_KIND[error.kind],
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Os dados enviados são inválidos.',
          details: error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
        },
      },
    };
  }

  return {
    status: 500,
    body: { error: { code: 'internal_error', message: 'Erro interno do servidor.' } },
  };
}
