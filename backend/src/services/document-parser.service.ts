import { PDFParse } from 'pdf-parse';

type UploadPayload = {
  fileName: string;
  fileType: string;
  fileBase64: string;
};

export type ParsedDocument = {
  content: string;
  pages: Array<{ pageNumber: number; text: string }>;
};

function isReadableText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 80) {
    return false;
  }

  const printableChars =
    normalized.match(/[A-Za-z0-9\s.,;:!?'"()\-_/\\@#$%^&*+=<>{}\[\]]/g)?.length ?? 0;
  const ratio = printableChars / normalized.length;
  const words = normalized.split(' ').filter(Boolean);

  return ratio > 0.88 && words.length >= 15;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

async function decodePdfText(buffer: Buffer): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pages = (result.pages ?? [])
      .map((page, index) => {
        const rawNumber = typeof page.num === 'number' ? page.num : index + 1;
        const pageNumber = rawNumber <= 0 ? index + 1 : rawNumber;
        return {
          pageNumber,
          text: normalizeText(page.text ?? '')
        };
      })
      .filter((page) => Boolean(page.text));

    const content = normalizeText(result.text ?? '');
    return { content, pages };
  } finally {
    await parser.destroy();
  }
}

export async function extractDocumentContent(upload: UploadPayload): Promise<ParsedDocument> {
  const buffer = Buffer.from(upload.fileBase64, 'base64');

  if (upload.fileType === 'text/plain' || upload.fileName.toLowerCase().endsWith('.txt')) {
    const text = normalizeText(buffer.toString('utf-8'));
    if (!text) {
      throw new Error('Uploaded text file is empty.');
    }
    return {
      content: text,
      pages: [{ pageNumber: 1, text }]
    };
  }

  if (upload.fileType === 'application/pdf' || upload.fileName.toLowerCase().endsWith('.pdf')) {
    const extracted = await decodePdfText(buffer);
    if (!isReadableText(extracted.content)) {
      throw new Error(
        'Could not extract readable text from this PDF. Please upload a text-based PDF, upload a .txt, or paste the content.'
      );
    }
    return extracted;
  }

  throw new Error('Unsupported file type. Only .txt and .pdf are allowed.');
}
