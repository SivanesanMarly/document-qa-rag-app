import crypto from 'node:crypto';

import { env } from '../config.js';
import { db } from '../db/client.js';
import { chunkText, roughTokenCount } from './chunking.service.js';
import { createEmbeddings } from './openai.service.js';

type IngestInput = {
  documentId: string;
  content: string;
};

export async function ingestDocument(input: IngestInput): Promise<{ chunkCount: number }> {
  const chunks = chunkText(input.content);

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const embeddings = await createEmbeddings(chunks);
  const now = new Date().toISOString();

  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, document_id, chunk_index, text, token_count, created_at)
     VALUES (@id, @documentId, @chunkIndex, @text, @tokenCount, @createdAt)`
  );

  const insertEmbedding = db.prepare(
    `INSERT INTO embeddings (id, chunk_id, model, vector_json, created_at)
     VALUES (@id, @chunkId, @model, @vectorJson, @createdAt)`
  );

  const writeAll = db.transaction(() => {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkId = crypto.randomUUID();
      const chunkTextValue = chunks[index];
      const embedding = embeddings[index];

      if (!chunkTextValue || !embedding) {
        continue;
      }

      insertChunk.run({
        id: chunkId,
        documentId: input.documentId,
        chunkIndex: index,
        text: chunkTextValue,
        tokenCount: roughTokenCount(chunkTextValue),
        createdAt: now
      });

      insertEmbedding.run({
        id: crypto.randomUUID(),
        chunkId,
        model: env.OPENAI_EMBEDDING_MODEL,
        vectorJson: JSON.stringify(embedding),
        createdAt: now
      });
    }
  });

  writeAll();
  return { chunkCount: chunks.length };
}
