import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { ragService } from '../services/rag.service.js';

const askSchema = z.object({
  question: z.string().min(2),
  documentIds: z.array(z.string().min(1)).optional()
});

export const askRoutes: FastifyPluginAsync = async (app) => {
  app.post('/ask', async (request, reply) => {
    const parseResult = askSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        message: 'Invalid request body',
        issues: parseResult.error.issues
      });
    }

    const result = await ragService.ask(parseResult.data.question, {
      documentIds: parseResult.data.documentIds ?? []
    });
    return reply.send(result);
  });
};
