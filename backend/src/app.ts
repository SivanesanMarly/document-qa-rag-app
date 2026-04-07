import cors from '@fastify/cors';
import Fastify from 'fastify';

import { env } from './config.js';
import './db/client.js';
import { askRoutes } from './routes/ask.js';
import { documentRoutes } from './routes/documents.js';
import { healthRoutes } from './routes/health.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: env.CORS_ORIGIN
  });

  app.register(healthRoutes);
  app.register(documentRoutes);
  app.register(askRoutes);

  return app;
}
