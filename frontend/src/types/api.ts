export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type DocumentSummary = {
  id: string;
  name: string;
  createdAt: string;
};

export type DocumentsResponse = {
  documents: DocumentSummary[];
};

export type CreateDocumentRequest = {
  name: string;
  content: string;
};

export type CreateDocumentResponse = {
  id: string;
  name: string;
  createdAt: string;
  message: string;
};

export type Citation = {
  documentName: string;
  chunkIndex: number;
  excerpt: string;
};

export type AskResponse = {
  answer: string;
  citations: Citation[];
};
