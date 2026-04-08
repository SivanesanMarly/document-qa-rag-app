import { env } from '../config.js';
import { db } from '../db/client.js';
import { completeWithContext, createEmbeddings } from './openai.service.js';

export type Citation = {
  documentName: string;
  pageNumber: number | null;
  reference: string | null;
};

export type AskResult = {
  answer: string;
  sourceMessage: string;
  citations: Citation[];
};

type AskOptions = {
  documentIds: string[];
};

type RetrievedChunk = {
  documentId: string;
  documentName: string;
  pageNumber: number | null;
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
    answer: `<p>${(raw.trim() || 'No answer generated.').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
    citationChunkIndices: []
  };
}

function safeJsonParse(raw: string): { answer: string; citationChunkIndices: number[] } | null {
  try {
    const parsed = JSON.parse(raw) as {
      answer?: unknown;
      answerHtml?: unknown;
      citationChunkIndices?: unknown;
    };

    const answerValue =
      typeof parsed.answerHtml === 'string'
        ? parsed.answerHtml
        : typeof parsed.answer === 'string'
          ? parsed.answer
          : null;

    if (!answerValue) {
      return null;
    }

    const citationChunkIndices = Array.isArray(parsed.citationChunkIndices)
      ? parsed.citationChunkIndices
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
          .map((value) => Math.trunc(value))
      : [];

    return {
      answer: answerValue,
      citationChunkIndices
    };
  } catch {
    return null;
  }
}

function extractReference(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();

  const urlMatch = normalized.match(/https?:\/\/[^\s)]+/i);
  if (urlMatch) {
    return urlMatch[0];
  }

  const doiMatch = normalized.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i);
  if (doiMatch) {
    return `DOI: ${doiMatch[0]}`;
  }

  const refSentenceMatch = normalized.match(
    /(reference|references|source|sources)\s*[:\-]\s*[^.]{8,200}/i
  );
  if (refSentenceMatch) {
    return refSentenceMatch[0];
  }

  return null;
}

function extractReferenceFromPageText(pageText: string): string | null {
  const compact = pageText.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!compact) {
    return null;
  }

  const headingMatch = compact.match(/(?:^|\n)(references?|bibliography|sources?)\s*[:\n]/i);
  if (headingMatch?.index !== undefined) {
    const afterHeading = compact.slice(headingMatch.index).split('\n').slice(1).join('\n').trim();
    if (afterHeading) {
      return afterHeading.slice(0, 600);
    }
  }

  const lines = compact.split('\n').map((line) => line.trim()).filter(Boolean);
  const citationLines = lines.filter((line) => {
    if (/^(\[\d+\]|\d+\.)\s+/.test(line)) {
      return true;
    }
    if (/https?:\/\/\S+/i.test(line)) {
      return true;
    }
    if (/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i.test(line)) {
      return true;
    }
    return false;
  });

  if (citationLines.length > 0) {
    return citationLines.slice(0, 3).join(' ');
  }

  return extractReference(compact);
}

function getPageText(documentId: string, pageNumber: number | null): string {
  const rows = db
    .prepare(
      `SELECT text
       FROM chunks
       WHERE document_id = @documentId
         AND ((@pageNumber IS NULL AND page_number IS NULL) OR page_number = @pageNumber)
       ORDER BY chunk_index ASC`
    )
    .all({ documentId, pageNumber }) as Array<{ text: string }>;

  return rows.map((row) => row.text).join('\n').trim();
}

function buildSourceMessage(citation?: Citation): string {
  if (!citation) {
    return 'Answer generated from selected documents, but no explicit citation marker was returned.';
  }

  if (citation.pageNumber) {
    return `Answer comes from "${citation.documentName}", page ${citation.pageNumber}.`;
  }

  return `Answer comes from "${citation.documentName}".`;
}

export class RagService {
  public async ask(question: string, options: AskOptions): Promise<AskResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY is missing. Set it in backend/.env to run question answering.'
      );
    }

    const [questionEmbedding] = await createEmbeddings([question]);
    if (!questionEmbedding) {
      throw new Error('Failed to create question embedding.');
    }

    const selectedIds = [...new Set(options.documentIds)].filter(Boolean);
    const hasFilter = selectedIds.length > 0;
    const documentPlaceholders = selectedIds.map((_, index) => `@doc${index}`).join(', ');

    const sql = `
      SELECT
        d.id as documentId,
        d.name as documentName,
        c.page_number as pageNumber,
        c.text as text,
        e.vector_json as vectorJson
      FROM embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE e.model = @model
      ${hasFilter ? `AND d.id IN (${documentPlaceholders})` : ''}
    `;

    const params: Record<string, string> = { model: env.OPENAI_EMBEDDING_MODEL };
    selectedIds.forEach((id, index) => {
      params[`doc${index}`] = id;
    });

    const rows = db.prepare(sql).all(params) as Array<{
      documentId: string;
      documentName: string;
      pageNumber: number | null;
      text: string;
      vectorJson: string;
    }>;

    if (rows.length === 0) {
      return {
        answer: hasFilter
          ? 'No indexed chunks found in selected documents.'
          : 'No indexed chunks found yet. Add at least one document first.',
        sourceMessage: 'No source available.',
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

    const relevantChunks = scored
      .filter((row) => row.similarity >= env.RAG_MIN_SIMILARITY)
      .slice(0, env.RAG_MAX_CHUNKS);

    const topChunks = relevantChunks.length > 0 ? relevantChunks : scored.slice(0, 5);

    if (topChunks.length === 0) {
      return {
        answer: 'No relevant chunks could be retrieved for this question.',
        sourceMessage: 'No source available.',
        citations: []
      };
    }

    const context = topChunks
      .map(
        (chunk, index) =>
          `[${index + 1}] doc="${chunk.documentName}" page=${chunk.pageNumber ?? 'N/A'}\n${chunk.text}`
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
        const pageText = getPageText(chunk.documentId, chunk.pageNumber);
        const reference = extractReferenceFromPageText(pageText);

        return {
          documentName: chunk.documentName,
          pageNumber: chunk.pageNumber,
          reference
        };
      });

    return {
      answer: parsed.answer,
      sourceMessage: buildSourceMessage(citations[0]),
      citations
    };
  }
}

export const ragService = new RagService();
