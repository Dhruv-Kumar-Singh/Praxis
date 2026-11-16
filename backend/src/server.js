import http from 'http';
import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';
import { attachWebSocket } from './realtime/wsServer.js';
import { logger } from './utils/logger.js';

if (env.REPO_DRIVER === 'mongo') {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info(`MongoDB connected to ${env.MONGODB_URI}`);
  } catch (err) {
    logger.error(`MongoDB initial connection failed: ${err.message}`);
  }
}

const server = http.createServer(app);
const wss = attachWebSocket(server);

server.listen(env.PORT, env.HOST, () => {
  logger.info(`Praxis API Server running at http://${env.HOST}:${env.PORT}`);
  logger.info(`WebSocket endpoint active at ws://${env.HOST}:${env.PORT}/ws/interview`);
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  logger.info(`${signal} received. Initiating graceful shutdown...`);

  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

  server.close(() => {
    logger.info('HTTP and WebSocket servers successfully closed.');
    process.exit(0);
  });

  // Force shutdown after timeout if pending handlers refuse to close
  setTimeout(() => {
    logger.error('Forced shutdown timeout exceeded. Exiting.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

