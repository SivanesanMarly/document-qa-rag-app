import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { api } from './lib/api';
import type { Citation, DocumentSummary } from './types/api';

type StatusKind = 'idle' | 'loading' | 'success' | 'error';
type DocumentInputMode = 'paste' | 'upload';
type ChatMessage =
  | {
      id: string;
      role: 'user';
      text: string;
    }
  | {
      id: string;
      role: 'assistant';
      html: string;
      sourceMessage: string;
      referenceLabel: string;
      referenceValue: string;
    }
  | {
      id: string;
      role: 'error';
      text: string;
    };

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

function createMessageId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
  const [backendStatus, setBackendStatus] = useState<StatusKind>('idle');
  const [statusMessage, setStatusMessage] = useState('Checking backend...');

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentMode, setDocumentMode] = useState<DocumentInputMode>('paste');
  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);
  const [documentError, setDocumentError] = useState('');

  const [question, setQuestion] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [askError, setAskError] = useState('');
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [documents]
  );
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

  useEffect(() => {
    const windowElement = chatWindowRef.current;
    if (!windowElement) {
      return;
    }
    windowElement.scrollTo({
      top: windowElement.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages, asking]);

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
      setShowAddDialog(false);
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
      const askedQuestion = question.trim();
      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'user',
          text: askedQuestion
        }
      ]);
      setQuestion('');

      const response = await api.ask(askedQuestion, selectedDocumentIds);
      const citation = response.citations[0] as Citation | undefined;
      const referenceLabel = citation
        ? `${citation.documentName}${citation.pageNumber ? ` · Page ${citation.pageNumber}` : ''}`
        : 'Reference';

      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'assistant',
          html: formatAndSanitizeAnswer(response.answer),
          sourceMessage: response.sourceMessage,
          referenceLabel,
          referenceValue: citation?.reference ?? 'Not explicitly found in selected text.'
        }
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAskError(message);
      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'error',
          text: message
        }
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Document Q&A with Citations</h1>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Uploaded Documents</h2>
            <p className="muted">
              Select source files for chat. Use the <strong>+</strong> button in chat input to add new
              text/files.
            </p>
          </div>
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
            <p className="source-selected">
              Selected: {selectedDocumentIds.length} / {documents.length}
            </p>
            {documents.length === 0 ? (
              <p className="muted">No documents yet. Add one from the chat + menu.</p>
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
        </aside>

        <div className="card chat-card">
          <h2>Chat</h2>
          <div className="answer-box">
            <div className="chat-shell">
              <div className="chat-window" ref={chatWindowRef}>
                {messages.length === 0 ? (
                  <div className="chat-empty">
                    <h3>Start a conversation</h3>
                    <p>Ask a question about your selected documents. Answers will include source context.</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    if (message.role === 'user') {
                      return (
                        <article key={message.id} className="chat-row user">
                          <span className="chat-avatar" aria-hidden="true">
                            🙋
                          </span>
                          <div className="chat-bubble user">
                            <p>{message.text}</p>
                          </div>
                        </article>
                      );
                    }

                    if (message.role === 'error') {
                      return (
                        <article key={message.id} className="chat-row assistant">
                          <div className="chat-bubble error">
                            <p>{message.text}</p>
                          </div>
                        </article>
                      );
                    }

                    return (
                      <article key={message.id} className="chat-row assistant">
                        <div className="chat-bubble assistant">
                          <div className="chat-meta">
                            <span className="chat-icon" aria-hidden="true">
                              🤖
                            </span>
                            <span>Assistant</span>
                          </div>
                          <div
                            className="answer-rich"
                            dangerouslySetInnerHTML={{
                              __html: message.html || '<p>No answer generated.</p>'
                            }}
                          />
                          <div className="reference-card compact">
                            <span className="reference-label">{message.referenceLabel}</span>
                            <p className="reference-hint">Reference: {message.referenceValue}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
                {asking ? (
                  <article className="chat-row assistant">
                    <div className="chat-bubble assistant typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </article>
                ) : null}
              </div>
              <div className="composer-wrap">
                {showComposerMenu ? (
                  <div className="composer-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setDocumentMode('paste');
                        setShowAddDialog(true);
                        setShowComposerMenu(false);
                      }}
                    >
                      <span className="menu-icon" aria-hidden="true">
                        📝
                      </span>
                      <span>Paste text</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDocumentMode('upload');
                        setShowAddDialog(true);
                        setShowComposerMenu(false);
                      }}
                    >
                      <span className="menu-icon" aria-hidden="true">
                        📎
                      </span>
                      <span>Add files</span>
                    </button>
                  </div>
                ) : null}
                <form onSubmit={onAsk} className="chat-input-row">
                  <button
                    type="button"
                    className="plus-btn"
                    onClick={() => setShowComposerMenu((prev) => !prev)}
                    aria-label="Open add options"
                  >
                    +
                  </button>
                  <input
                    type="text"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask about your uploaded documents"
                  />
                  <button type="submit" disabled={asking || selectedDocumentIds.length === 0}>
                    {asking ? 'Thinking...' : 'Send'}
                  </button>
                </form>
              </div>
            </div>
            {askError ? <p className="error">{askError}</p> : null}
          </div>
        </div>
      </section>

      {showAddDialog ? (
        <div className="dialog-backdrop" onClick={() => setShowAddDialog(false)}>
          <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h3>Add Document</h3>
              <button
                type="button"
                className="dialog-close"
                onClick={() => {
                  setShowAddDialog(false);
                  setDocumentError('');
                }}
                aria-label="Close add document dialog"
              >
                ×
              </button>
            </div>
            <form className="quick-add-panel" onSubmit={onSubmitDocument}>
              <div className="mode-tabs" role="tablist" aria-label="Document input mode">
                <button
                  type="button"
                  className={documentMode === 'paste' ? 'mode-tab active' : 'mode-tab'}
                  onClick={() => setDocumentMode('paste')}
                >
                  <span className="menu-icon" aria-hidden="true">
                    📝
                  </span>
                  Paste Text
                </button>
                <button
                  type="button"
                  className={documentMode === 'upload' ? 'mode-tab active' : 'mode-tab'}
                  onClick={() => setDocumentMode('upload')}
                >
                  <span className="menu-icon" aria-hidden="true">
                    📎
                  </span>
                  Upload File
                </button>
              </div>
              <input
                type="text"
                value={documentName}
                onChange={(event) => setDocumentName(event.target.value)}
                placeholder="Document name"
              />
              {documentMode === 'paste' ? (
                <textarea
                  rows={6}
                  value={documentContent}
                  onChange={(event) => setDocumentContent(event.target.value)}
                  placeholder="Paste text content..."
                />
              ) : (
                <label className="file-picker">
                  <input
                    type="file"
                    accept=".txt,.pdf,text/plain,application/pdf"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="file-picker-icon" aria-hidden="true">
                    📎
                  </span>
                  <span className="file-picker-title">Choose a file to upload</span>
                  <span className="file-picker-help">Supported: .txt, .pdf</span>
                  {documentFile ? (
                    <span className="file-chip">{documentFile.name}</span>
                  ) : (
                    <span className="file-chip muted-chip">No file selected</span>
                  )}
                </label>
              )}
              {documentError ? <p className="error">{documentError}</p> : null}
              <div className="quick-add-actions">
                <button type="submit" disabled={savingDocument}>
                  {savingDocument ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn-muted"
                  onClick={() => {
                    setShowAddDialog(false);
                    setDocumentError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
