import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { InterviewSession } from './interviewSession.js';
import { logger } from '../utils/logger.js';

/**
 * Attaches the WebSocket interview server to an HTTP/HTTPS server instance.
 * @param {import('http').Server} httpServer
 * @returns {WebSocketServer}
 */
export function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/interview',
  });

  wss.on('connection', async (ws, req) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const token = parsedUrl.searchParams.get('token');

      if (!token) {
        ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TOKEN', message: 'Token query parameter required' }));
        ws.close(4000, 'Missing interview token');
        return;
      }

      const session = new InterviewSession(ws, token);
      const ready = await session.init();
      if (!ready) return;

      ws.on('message', async (data, isBinary) => {
        if (isBinary) {
          await session.handleAudioFrame(Buffer.from(data));
        } else {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
            } else if (parsed.type === 'session.stop') {
              await session.endSession('client_requested');
            }
          } catch {
            // Ignore non-json text frames
          }
        }
      });

      ws.on('close', (code, reason) => {
        session.cleanup();
      });

      ws.on('error', (err) => {
        logger.error({ err, sessionId: session.sessionId }, 'WebSocket client connection error');
        session.cleanup();
      });
    } catch (err) {
      logger.error({ err }, 'Error during WebSocket connection handshake');
      ws.close(1011, 'Internal connection error');
    }
  });

  logger.info('WebSocket handler mounted at /ws/interview');
  return wss;
}

