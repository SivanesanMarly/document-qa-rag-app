export type TextPage = {
  pageNumber: number;
  text: string;
};

export type ChunkWithPage = {
  text: string;
  pageNumber: number | null;
};

export function chunkText(input: string, maxChars = 800, overlap = 120): string[] {
  const text = input.replace(/\r\n/g, '\n').trim();

  if (!text) {
    return [];
  }

  const chunks: string[] = [];
  const step = Math.max(1, maxChars - overlap);

  for (let start = 0; start < text.length; start += step) {
    const chunk = text.slice(start, start + maxChars).trim();
    if (!chunk) {
      continue;
    }
    chunks.push(chunk);
    if (start + maxChars >= text.length) {
      break;
    }
  }

  return chunks;
}

export function chunkPages(inputPages: TextPage[], maxChars = 800, overlap = 120): ChunkWithPage[] {
  const result: ChunkWithPage[] = [];
  for (const page of inputPages) {
    const pageChunks = chunkText(page.text, maxChars, overlap);
    for (const chunk of pageChunks) {
      result.push({
        text: chunk,
        pageNumber: page.pageNumber
      });
    }
  }
  return result;
}

export function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
