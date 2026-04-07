# Document Q&A with Citations

Initial scaffold for the take-home assignment: a React + TypeScript frontend and a Fastify + TypeScript backend with SQLite.

## Project structure

- `frontend`: Vite + React + TypeScript client
- `backend`: Fastify API + SQLite-ready foundation

## Quick start

1. Copy environment files:
   - `backend/.env`
   - `frontend/.env`
2. Install dependencies:
   - `cd backend && npm install`
   - `cd ../frontend && npm install`
3. Run backend:
   - `cd backend && npm run dev`
4. Run frontend:
   - `cd frontend && npm run dev`

## Current status

This commit sets up the initial structure and health-check flow.
RAG ingestion (`chunk -> embed -> store`) and Q&A (`retrieve -> answer + citations`) are intentionally scaffolded and will be implemented incrementally.

## Environment

See:
- `/.env`
- `backend/.env`
- `frontend/.env`
