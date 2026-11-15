import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import sessionsRouter from './routes/sessions.js';
import dashboardRouter from './routes/dashboard.js';
import auditRouter from './routes/audit.js';
import notificationsRouter from './routes/notifications.js';

export const app = express();

// Security & baseline middleware
app.use(helmet());

const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (e.g. mobile apps or curl)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(requestId);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Apply global rate limiting to all /api routes
app.use('/api', apiLimiter);

// API v1 Routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/sessions', sessionsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/notifications', notificationsRouter);

// 404 Catch-all
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` } });
});

// Centralized error handling
app.use(errorHandler);

