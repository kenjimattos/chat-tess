import type { RequestHandler } from 'express';

/** Substitui o rate limit nos testes de rotas que não tratam dele. */
export const noRateLimit: RequestHandler = (_request, _response, next) => next();
