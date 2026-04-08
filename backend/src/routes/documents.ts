import crypto from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/client.js';
import { extractDocumentContent } from '../services/document-parser.service.js';
import { ingestDocument } from '../services/ingest.service.js';

const createDocumentSchema = z
  .object({
    name: z.string().min(1),
    content: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
    fileType: z.string().min(1).optional(),
    fileBase64: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    const hasText = Boolean(value.content?.trim());
    const hasUpload = Boolean(value.fileName && value.fileType && value.fileBase64);

    if (!hasText && !hasUpload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Provide either pasted content or a file upload payload.'
      });
    }
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
    let resolvedContent = payload.content?.trim() ?? '';
    let pageSegments: Array<{ pageNumber: number; text: string }> = [];

    if (!resolvedContent && payload.fileName && payload.fileType && payload.fileBase64) {
      try {
        const parsedDocument = await extractDocumentContent({
          fileName: payload.fileName,
          fileType: payload.fileType,
          fileBase64: payload.fileBase64
        });
        resolvedContent = parsedDocument.content;
        pageSegments = parsedDocument.pages;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to parse uploaded file';
        return reply.code(400).send({ message });
      }
    }

    if (!resolvedContent) {
      return reply.code(400).send({ message: 'Resolved document content is empty.' });
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    db.prepare(
      `INSERT INTO documents (id, name, content, created_at)
       VALUES (@id, @name, @content, @createdAt)`
    ).run({ id, name: payload.name, content: resolvedContent, createdAt: now });

    try {
      const ingestResult = await ingestDocument({
        documentId: id,
        content: resolvedContent,
        pages: pageSegments
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
