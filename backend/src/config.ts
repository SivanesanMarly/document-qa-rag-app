import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('127.0.0.1'),
  DB_PATH: z.string().default('./data/app.db'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4.1-mini'),
  RAG_MIN_SIMILARITY: z.coerce.number().default(0.2),
  RAG_MAX_CHUNKS: z.coerce.number().int().positive().default(20)
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
