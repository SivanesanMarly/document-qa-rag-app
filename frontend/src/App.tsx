import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { api } from './lib/api';
import type { Citation, DocumentSummary } from './types/api';

type StatusKind = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [backendStatus, setBackendStatus] = useState<StatusKind>('idle');
  const [statusMessage, setStatusMessage] = useState('Checking backend...');

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentName, setDocumentName] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [savingDocument, setSavingDocument] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [askError, setAskError] = useState('');
  const [asking, setAsking] = useState(false);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [documents]
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    try {
      setBackendStatus('loading');
      const health = await api.health();
      setBackendStatus('success');
      setStatusMessage(`Backend OK (${health.service})`);
      await refreshDocuments();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setBackendStatus('error');
      setStatusMessage(`Backend unavailable: ${message}`);
    }
  }

  async function refreshDocuments() {
    const response = await api.listDocuments();
    setDocuments(response.documents);
  }

  async function onSubmitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!documentName.trim() || !documentContent.trim()) {
      return;
    }

    try {
      setSavingDocument(true);
      await api.createDocument({
        name: documentName.trim(),
        content: documentContent.trim()
      });
      setDocumentName('');
      setDocumentContent('');
      await refreshDocuments();
    } finally {
      setSavingDocument(false);
    }
  }

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAskError('');

    if (!question.trim()) {
      return;
    }

    try {
      setAsking(true);
      const response = await api.ask(question.trim());
      setAnswer(response.answer);
      setCitations(response.citations);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAskError(message);
      setCitations([]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Document Q&A with Citations</h1>
        <p className={`status status-${backendStatus}`}>{statusMessage}</p>
      </header>

      <section className="card">
        <h2>Add Document</h2>
        <form onSubmit={onSubmitDocument} className="form-grid">
          <label>
            Document name
            <input
              type="text"
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              placeholder="e.g. Product Requirements"
            />
          </label>
          <label>
            Content
            <textarea
              rows={7}
              value={documentContent}
              onChange={(event) => setDocumentContent(event.target.value)}
              placeholder="Paste text content here"
            />
          </label>
          <button type="submit" disabled={savingDocument}>
            {savingDocument ? 'Saving...' : 'Save Document'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Ask Question</h2>
        <form onSubmit={onAsk} className="form-grid">
          <label>
            Question
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about your uploaded documents"
            />
          </label>
          <button type="submit" disabled={asking}>
            {asking ? 'Asking...' : 'Ask'}
          </button>
        </form>
        <div className="answer-box">
          {askError ? <p className="error">{askError}</p> : null}
          {!askError && answer ? <p>{answer}</p> : null}
          {!askError && !answer ? (
            <p className="muted">No answer yet. Ask a question to test the API path.</p>
          ) : null}
          {!askError && citations.length > 0 ? (
            <div className="citations">
              <h3>Citations</h3>
              <ul>
                {citations.map((citation, index) => (
                  <li key={`${citation.documentName}-${citation.chunkIndex}-${index}`}>
                    <strong>
                      {citation.documentName} (chunk {citation.chunkIndex})
                    </strong>
                    <p>{citation.excerpt}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2>Documents ({sortedDocuments.length})</h2>
        {sortedDocuments.length === 0 ? (
          <p className="muted">No documents added yet.</p>
        ) : (
          <ul className="doc-list">
            {sortedDocuments.map((doc) => (
              <li key={doc.id}>
                <strong>{doc.name}</strong>
                <span>{new Date(doc.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
