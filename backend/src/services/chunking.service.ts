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

export function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
