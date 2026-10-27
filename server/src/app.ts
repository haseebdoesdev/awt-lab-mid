import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { env, isTest } from './config/env.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter from './routes/messages.js';
import usersRouter from './routes/users.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (!isTest) app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/conversations', requireAuth, conversationsRouter);
  app.use('/api/messages', requireAuth, messagesRouter);
  app.use('/api/admin', requireAuth, requireRole('admin'), adminRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
