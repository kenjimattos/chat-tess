import path from 'node:path';
import express, { type RequestHandler, type Router } from 'express';

/**
 * Serve o build do frontend. Qualquer GET que não seja um arquivo estático
 * devolve o index.html, para que as rotas do lado do cliente funcionem.
 */
export function createWebAppRouter(distDir: string): Router {
  const router = express.Router();
  const indexFile = path.resolve(distDir, 'index.html');

  const serveIndex: RequestHandler = (request, response, next) => {
    if (request.method !== 'GET' || !request.accepts('html')) {
      next();
      return;
    }
    response.sendFile(indexFile);
  };

  router.use(express.static(path.resolve(distDir), { index: false }));
  router.use(serveIndex);

  return router;
}
