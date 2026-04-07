# Backend

Fastify + TypeScript API service for document ingestion and question answering with citations.

## Scripts

- `npm run dev`: start server in watch mode
- `npm run check`: type check
- `npm run lint`: run lint
- `npm run build`: compile to `dist/`
- `npm run start`: run compiled build

## Environment

Use `.env` in this folder:

```env
PORT=4000
HOST=127.0.0.1
DB_PATH=./data/app.db
CORS_ORIGIN=http://localhost:5173
OPENAI_API_KEY=your_openai_key_here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4.1-mini
```

## API

- `GET /health`
- `GET /documents`
- `POST /documents`
- `POST /ask`

## Flow

- `POST /documents`: stores document, chunks content, generates embeddings, stores chunks + vectors.
- `POST /ask`: embeds question, retrieves top chunks by cosine similarity, asks model with retrieved context, returns answer + references.
