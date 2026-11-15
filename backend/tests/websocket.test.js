import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { attachWebSocket } from '../src/realtime/wsServer.js';
import { userRepo, sessionRepo, __resetStore } from '../src/repositories/index.js';
import { env } from '../src/config/env.js';

describe('WebSocket Interview Handshake (/ws/interview)', () => {
  let server;
  let serverPort;
  let session;
  let validInterviewToken;
  let regularAccessToken;

  beforeAll(async () => {
    server = http.createServer(app);
    attachWebSocket(server);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    __resetStore();

    const user = await userRepo.create({
      email: 'alex@praxis.internal',
      passwordHash: 'hash',
      role: 'candidate',
      name: 'Alex',
    });

    session = await sessionRepo.create({
      candidateId: user.id,
      role: 'Staff Engineer',
      topic: 'System Design',
      status: 'scheduled',
    });

    validInterviewToken = jwt.sign(
      { sub: user.id, role: user.role, sessionId: session.id, type: 'interview' },
      env.JWT_SECRET
    );

    regularAccessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, type: 'access' },
      env.JWT_SECRET
    );
  });

  it('rejects connection without token query parameter', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/interview`);

    const closeCode = await new Promise((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4000);
  });

  it('rejects connection with an invalid token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/interview?token=invalid_jwt_token`);

    const closeCode = await new Promise((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4001);
  });

  it('rejects connection with a normal API access token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/interview?token=${regularAccessToken}`);

    const closeCode = await new Promise((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    expect(closeCode).toBe(4002);
  });

  it('successfully handshakes with valid interview token and emits session.ready', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/interview?token=${validInterviewToken}`);

    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS timeout')), 3000);
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'session.ready') {
            clearTimeout(timer);
            resolve(parsed);
          }
        } catch {
          // ignore
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(message.type).toBe('session.ready');
    expect(message.sessionId).toBe(session.id);

    ws.close();
  });
});

