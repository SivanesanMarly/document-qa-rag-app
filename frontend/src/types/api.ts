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
  content?: string;
  fileName?: string;
  fileType?: string;
  fileBase64?: string;
};

export type CreateDocumentResponse = {
  id: string;
  name: string;
  createdAt: string;
  message: string;
};

export type Citation = {
  documentName: string;
  pageNumber: number | null;
  reference: string | null;
};

export type AskResponse = {
  answer: string;
  sourceMessage: string;
  citations: Citation[];
};
