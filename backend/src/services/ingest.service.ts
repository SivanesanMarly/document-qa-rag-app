import crypto from 'node:crypto';

import { env } from '../config.js';
import { db } from '../db/client.js';
import { chunkPages, chunkText, roughTokenCount, type ChunkWithPage } from './chunking.service.js';
import { createEmbeddings } from './openai.service.js';

type IngestInput = {
  documentId: string;
  content: string;
  pages?: Array<{ pageNumber: number; text: string }>;
};

export async function ingestDocument(input: IngestInput): Promise<{ chunkCount: number }> {
  const chunks: ChunkWithPage[] =
    input.pages && input.pages.length > 0
      ? chunkPages(input.pages)
      : chunkText(input.content).map((text) => ({ text, pageNumber: null }));

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const embeddings = await createEmbeddings(chunks.map((chunk) => chunk.text));
  const now = new Date().toISOString();

  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, document_id, chunk_index, page_number, text, token_count, created_at)
     VALUES (@id, @documentId, @chunkIndex, @pageNumber, @text, @tokenCount, @createdAt)`
  );

  const insertEmbedding = db.prepare(
    `INSERT INTO embeddings (id, chunk_id, model, vector_json, created_at)
     VALUES (@id, @chunkId, @model, @vectorJson, @createdAt)`
  );

  const writeAll = db.transaction(() => {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkId = crypto.randomUUID();
      const chunk = chunks[index];
      const embedding = embeddings[index];

      if (!chunk || !embedding) {
        continue;
      }

      insertChunk.run({
        id: chunkId,
        documentId: input.documentId,
        chunkIndex: index,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        tokenCount: roughTokenCount(chunk.text),
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
