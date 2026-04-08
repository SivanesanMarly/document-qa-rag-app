import { env } from '../config.js';

type EmbeddingResponse = {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
};

type ChatResponse = {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
};

function assertApiKey() {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is missing. Set it in backend/.env to enable embeddings and Q&A.'
    );
  }
}

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  assertApiKey();

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: inputs
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embedding request failed: ${text}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  return payload.data.sort((a, b) => a.index - b.index).map((row) => row.embedding);
}

export async function completeWithContext(question: string, context: string): Promise<string> {
  assertApiKey();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENAI_CHAT_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'You are a document QA assistant. Use only the provided context. If the answer is not present, say so clearly. Return JSON only in this schema: {"answerHtml":"string","citationChunkIndices":[number]}. answerHtml must be semantic HTML only (use h3, p, ul, ol, li, table, strong, em when helpful). Do not use markdown. citationChunkIndices are 1-based chunk ids from the provided context labels.'
        },
        {
          role: 'user',
          content: `Question:\n${question}\n\nContext chunks:\n${context}`
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat completion request failed: ${text}`);
  }

  const payload = (await response.json()) as ChatResponse;
  return payload.choices[0]?.message.content ?? '';
}
