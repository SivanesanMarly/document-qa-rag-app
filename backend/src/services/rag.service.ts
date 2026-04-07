import { env } from '../config.js';
import { db } from '../db/client.js';
import { completeWithContext, createEmbeddings } from './openai.service.js';

export type Citation = {
  documentName: string;
  chunkIndex: number;
  excerpt: string;
};

export type AskResult = {
  answer: string;
  citations: Citation[];
};

type RetrievedChunk = {
  documentName: string;
  chunkIndex: number;
  text: string;
  vectorJson: string;
  similarity: number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return -1;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (magA === 0 || magB === 0) {
    return -1;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function parseModelOutput(raw: string): { answer: string; citationChunkIndices: number[] } {
  const direct = safeJsonParse(raw);
  if (direct) {
    return direct;
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = safeJsonParse(match[0]);
    if (parsed) {
      return parsed;
    }
  }

  return {
    answer: raw.trim() || 'No answer generated.',
    citationChunkIndices: []
  };
}

function safeJsonParse(raw: string): { answer: string; citationChunkIndices: number[] } | null {
  try {
    const parsed = JSON.parse(raw) as {
      answer?: unknown;
      citationChunkIndices?: unknown;
    };

    if (typeof parsed.answer !== 'string') {
      return null;
    }

    const citationChunkIndices = Array.isArray(parsed.citationChunkIndices)
      ? parsed.citationChunkIndices
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
          .map((value) => Math.trunc(value))
      : [];

    return {
      answer: parsed.answer,
      citationChunkIndices
    };
  } catch {
    return null;
  }
}

export class RagService {
  public async ask(question: string): Promise<AskResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY is missing. Set it in backend/.env to run question answering.'
      );
    }

    const [questionEmbedding] = await createEmbeddings([question]);
    if (!questionEmbedding) {
      throw new Error('Failed to create question embedding.');
    }

    const rows = db
      .prepare(
        `SELECT
          d.name as documentName,
          c.chunk_index as chunkIndex,
          c.text as text,
          e.vector_json as vectorJson
        FROM embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE e.model = @model`
      )
      .all({ model: env.OPENAI_EMBEDDING_MODEL }) as Array<{
      documentName: string;
      chunkIndex: number;
      text: string;
      vectorJson: string;
    }>;

    if (rows.length === 0) {
      return {
        answer: 'No indexed chunks found yet. Add at least one document first.',
        citations: []
      };
    }

    const scored: RetrievedChunk[] = rows
      .map((row) => {
        const vector = JSON.parse(row.vectorJson) as number[];
        return {
          ...row,
          similarity: cosineSimilarity(questionEmbedding, vector)
        };
      })
      .filter((row) => row.similarity > -1)
      .sort((a, b) => b.similarity - a.similarity);

    const topChunks = scored.slice(0, 5);

    if (topChunks.length === 0) {
      return {
        answer: 'No relevant chunks could be retrieved for this question.',
        citations: []
      };
    }

    const context = topChunks
      .map(
        (chunk, index) =>
          `[${index + 1}] doc="${chunk.documentName}" chunk=${chunk.chunkIndex}\n${chunk.text}`
      )
      .join('\n\n');

    const rawModelOutput = await completeWithContext(question, context);
    const parsed = parseModelOutput(rawModelOutput);

    const uniqueIndices = [...new Set(parsed.citationChunkIndices)].filter(
      (value) => value >= 1 && value <= topChunks.length
    );

    const citations = uniqueIndices
      .map((index) => topChunks[index - 1])
      .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
      .map((chunk) => {
      return {
        documentName: chunk.documentName,
        chunkIndex: chunk.chunkIndex,
        excerpt: chunk.text.slice(0, 280)
      };
      });

    return {
      answer: parsed.answer,
      citations
    };
  }
}

export const ragService = new RagService();
