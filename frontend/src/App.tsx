import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { api } from './lib/api';
import type { Citation, DocumentSummary } from './types/api';

type StatusKind = 'idle' | 'loading' | 'success' | 'error';
type DocumentInputMode = 'paste' | 'upload';

const ALLOWED_TAGS = new Set([
  'h2',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'blockquote',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'br',
  'a'
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeAnswerHtml(input: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;

  if (!root) {
    return '';
  }

  const elements = Array.from(root.querySelectorAll('*'));
  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attr of Array.from(element.attributes)) {
      const attrName = attr.name.toLowerCase();
      if (tag === 'a' && (attrName === 'href' || attrName === 'target' || attrName === 'rel')) {
        continue;
      }
      element.removeAttribute(attr.name);
    }

    if (tag === 'a') {
      const href = element.getAttribute('href') ?? '';
      const safeHref =
        href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:');

      if (!safeHref) {
        element.removeAttribute('href');
      } else {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }

  return root.innerHTML.trim();
}

function formatAndSanitizeAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) {
    return '';
  }

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  const html = containsHtml
    ? trimmed
    : trimmed
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
        .join('');

  return sanitizeAnswerHtml(html);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function App() {
  const [backendStatus, setBackendStatus] = useState<StatusKind>('idle');
  const [statusMessage, setStatusMessage] = useState('Checking backend...');

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentMode, setDocumentMode] = useState<DocumentInputMode>('paste');
  const [documentName, setDocumentName] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentError, setDocumentError] = useState('');

  const [question, setQuestion] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [sourceMessage, setSourceMessage] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [askError, setAskError] = useState('');
  const [asking, setAsking] = useState(false);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [documents]
  );
  const answerHtml = useMemo(() => formatAndSanitizeAnswer(answer), [answer]);

  useEffect(() => {
    setSelectedDocumentIds((previous) => {
      if (documents.length === 0) {
        return [];
      }

      const availableIds = documents.map((doc) => doc.id);
      const retained = previous.filter((id) => availableIds.includes(id));

      if (retained.length === 0) {
        return availableIds;
      }

      return retained;
    });
  }, [documents]);

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
    setDocumentError('');

    if (!documentName.trim()) {
      return;
    }

    try {
      setSavingDocument(true);
      if (documentMode === 'paste') {
        if (!documentContent.trim()) {
          setDocumentError('Paste text content before saving.');
          return;
        }
        await api.createDocument({
          name: documentName.trim(),
          content: documentContent.trim()
        });
      } else {
        if (!documentFile) {
          setDocumentError('Select a .txt or .pdf file before saving.');
          return;
        }

        const allowedTypes = ['text/plain', 'application/pdf'];
        const isTxt = documentFile.name.toLowerCase().endsWith('.txt');
        const isPdf = documentFile.name.toLowerCase().endsWith('.pdf');
        const isAllowed = allowedTypes.includes(documentFile.type) || isTxt || isPdf;

        if (!isAllowed) {
          setDocumentError('Unsupported file format. Please upload a .txt or .pdf file.');
          return;
        }

        const fileBase64 = await fileToBase64(documentFile);
        await api.createDocument({
          name: documentName.trim(),
          fileName: documentFile.name,
          fileType: documentFile.type || (isPdf ? 'application/pdf' : 'text/plain'),
          fileBase64
        });
      }

      setDocumentName('');
      setDocumentContent('');
      setDocumentFile(null);
      await refreshDocuments();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setDocumentError(message);
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
    if (selectedDocumentIds.length === 0) {
      setAskError('Select at least one uploaded document to ask a question.');
      return;
    }

    try {
      setAsking(true);
      setAnswer('');
      setSourceMessage('');
      setCitations([]);
      const response = await api.ask(question.trim(), selectedDocumentIds);
      setAnswer(response.answer);
      setSourceMessage(response.sourceMessage);
      setCitations(response.citations);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAskError(message);
      setSourceMessage('');
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
          <div className="mode-tabs" role="tablist" aria-label="Document input mode">
            <button
              type="button"
              className={documentMode === 'paste' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setDocumentMode('paste')}
            >
              Paste Text
            </button>
            <button
              type="button"
              className={documentMode === 'upload' ? 'mode-tab active' : 'mode-tab'}
              onClick={() => setDocumentMode('upload')}
            >
              Upload File
            </button>
          </div>
          <label>
            Document name
            <input
              type="text"
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              placeholder="e.g. Product Requirements"
            />
          </label>
          {documentMode === 'paste' ? (
            <label>
              Content
              <textarea
                rows={7}
                value={documentContent}
                onChange={(event) => setDocumentContent(event.target.value)}
                placeholder="Paste text content here"
              />
            </label>
          ) : (
            <label>
              File
              <input
                type="file"
                accept=".txt,.pdf,text/plain,application/pdf"
                onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
          {documentError ? <p className="error">{documentError}</p> : null}
          <button type="submit" disabled={savingDocument}>
            {savingDocument ? 'Saving...' : 'Save Document'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Ask Question</h2>
        <form onSubmit={onAsk} className="form-grid">
          <div className="source-picker">
            <div className="source-picker-header">
              <span>Sources</span>
              {documents.length > 0 ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setSelectedDocumentIds(documents.map((doc) => doc.id))}
                >
                  Select all
                </button>
              ) : null}
            </div>
            {documents.length === 0 ? (
              <p className="muted">Upload at least one document to enable asking.</p>
            ) : (
              <ul className="source-list">
                {sortedDocuments.map((doc) => {
                  const checked = selectedDocumentIds.includes(doc.id);
                  return (
                    <li key={doc.id}>
                      <label className={checked ? 'source-item checked' : 'source-item'}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setSelectedDocumentIds((previous) => [...previous, doc.id]);
                              return;
                            }
                            setSelectedDocumentIds((previous) =>
                              previous.filter((id) => id !== doc.id)
                            );
                          }}
                        />
                        <span className="source-name">{doc.name}</span>
                        <span className="source-date">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
          {!askError && answer ? (
            <article className="answer-panel">
              <h3>Answer</h3>
              <div className="answer-rich" dangerouslySetInnerHTML={{ __html: answerHtml }} />
              {sourceMessage ? <p className="source-message">{sourceMessage}</p> : null}
            </article>
          ) : null}
          {!askError && !answer ? (
            <p className="muted">No answer yet. Ask a question to test the API path.</p>
          ) : null}
          {!askError && citations.length > 0 ? (
            <div className="citations">
              <h3>References</h3>
              <div className="reference-list">
                <div className="reference-card">
                  <span className="reference-label">
                    {citations[0]?.documentName}
                    {citations[0]?.pageNumber ? ` · Page ${citations[0].pageNumber}` : ''}
                  </span>
                  {citations[0]?.reference ? (
                    <p className="reference-hint">Reference: {citations[0].reference}</p>
                  ) : (
                    <p className="reference-hint">Reference: Not explicitly found in selected text.</p>
                  )}
                </div>
              </div>
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
