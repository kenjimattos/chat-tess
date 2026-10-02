import { composeApplication } from './composition-root';
import { loadConfig } from './infra/config/env';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const application = composeApplication(config);
const { app, logger } = application;

await application.initialize();

const server = app.listen(config.http.port, () => {
  logger.info(
    { port: config.http.port, environment: config.environment, authMode: config.auth.mode },
    'API no ar',
  );
});

// O Cloud Run envia SIGTERM antes de encerrar a instância.
function shutDown(signal: string): void {
  logger.info({ signal }, 'Encerrando a API');
  server.close(() => {
    application.shutDown().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
