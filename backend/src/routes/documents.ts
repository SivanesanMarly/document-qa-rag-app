import crypto from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/client.js';
import { ingestDocument } from '../services/ingest.service.js';

const createDocumentSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1)
});

export const documentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/documents', async () => {
    const documents = db
      .prepare(
        `SELECT id, name, created_at as createdAt
         FROM documents
         ORDER BY created_at DESC`
      )
      .all();

    return { documents };
  });

  app.post('/documents', async (request, reply) => {
    const parseResult = createDocumentSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.code(400).send({
        message: 'Invalid request body',
        issues: parseResult.error.issues
      });
    }

    const payload = parseResult.data;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    db.prepare(
      `INSERT INTO documents (id, name, content, created_at)
       VALUES (@id, @name, @content, @createdAt)`
    ).run({ id, name: payload.name, content: payload.content, createdAt: now });

    try {
      const ingestResult = await ingestDocument({
        documentId: id,
        content: payload.content
      });

      return reply.code(201).send({
        id,
        name: payload.name,
        createdAt: now,
        message: `Document saved and indexed (${ingestResult.chunkCount} chunks).`
      });
    } catch (error) {
      db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
      const message = error instanceof Error ? error.message : 'Unknown ingestion error';
      return reply.code(500).send({ message });
    }
  });
};
