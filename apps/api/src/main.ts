import { composeApplication } from './composition-root';
import { loadConfig } from './shared/config/env';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const { app, logger } = composeApplication(config);

const server = app.listen(config.http.port, () => {
  logger.info({ port: config.http.port, environment: config.environment }, 'API no ar');
});

// O Cloud Run envia SIGTERM antes de encerrar a instância.
function shutDown(signal: string): void {
  logger.info({ signal }, 'Encerrando a API');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
