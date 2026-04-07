import type {
  AskResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  DocumentsResponse,
  HealthResponse
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  listDocuments: () => request<DocumentsResponse>('/documents'),
  createDocument: (payload: CreateDocumentRequest) =>
    request<CreateDocumentResponse>('/documents', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  ask: (question: string) =>
    request<AskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify({ question })
    })
};
