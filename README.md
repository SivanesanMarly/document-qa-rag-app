# Document Q&A with Citations

Local fullstack app for document question answering with references.

- Frontend: React + TypeScript (Vite)
- Backend: Fastify + TypeScript
- Storage: SQLite
- AI: OpenAI embeddings + chat completion

## Repository structure

- `frontend/` UI to upload documents, ask questions, and view references
- `backend/` API for ingestion, embedding, retrieval, and answer generation

## Prerequisites

- Node.js 22+ (tested with Node 24)
- npm 10+
- OpenAI API key

## 1) Clone and install

```bash
git clone <your-repo-url>
cd doc-rag

cd backend && npm install
cd ../frontend && npm install
```

## 2) Create environment files

Create `backend/.env`:

```env
PORT=4000
HOST=127.0.0.1
DB_PATH=./data/app.db
CORS_ORIGIN=http://localhost:5173
OPENAI_API_KEY=your_openai_key_here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4.1-mini
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000
```

## 3) Run locally

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

## 4) Use the app

1. Add a document name and content, then save.
2. Ask a natural language question.
3. View:
   - Answer
   - References (document name + relevant excerpt)

## API summary

- `GET /health`
- `GET /documents`
- `POST /documents`
- `POST /ask`

## Notes

- App is intended for local evaluation use.
- Do not commit secrets (`.env` files are ignored by git).
- SQLite DB files in `backend/data` are runtime artifacts and ignored by git.
