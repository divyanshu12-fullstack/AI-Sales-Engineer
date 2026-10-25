import { createApp } from './app.js';
import { ConfigurationError, loadEnvironment } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { startSupportEmailWorker } from './modules/support/email.js';

const startServer = (): void => {
  const config = loadEnvironment();
  const logger = createLogger(config.LOG_LEVEL);
  const app = createApp(config, logger);
  const stopEmailWorker = startSupportEmailWorker(config, logger);
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      { event: 'server_started', host: config.HOST, port: config.PORT },
      'API listening.',
    );
  });

  server.on('error', (error) => {
    logger.fatal(
      { event: 'server_error', code: 'code' in error ? error.code : 'UNKNOWN' },
      'API could not start. Check the host and port configuration.',
    );
    process.exitCode = 1;
  });

  const shutdown = (signal: string): void => {
    stopEmailWorker();
    logger.info({ event: 'shutdown_started', signal }, 'Closing HTTP server.');
    const deadline = setTimeout(() => {
      logger.error({ event: 'shutdown_timeout' }, 'HTTP shutdown exceeded 10 seconds.');
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      logger.info({ event: 'shutdown_completed' }, 'HTTP server closed.');
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
};

try {
  startServer();
} catch (error: unknown) {
  createLogger('error').fatal(
    {
      event: 'startup_failed',
      reason: error instanceof ConfigurationError ? error.message : 'Unexpected startup failure.',
    },
    'API configuration could not be loaded.',
  );
  process.exitCode = 1;
}
