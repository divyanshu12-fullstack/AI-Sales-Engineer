import { createHash } from 'node:crypto';

export const chunkerVersion = 'markdown-sections-v1';
export const contentHash = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

// Sections keep pricing tables and issue IDs together. Oversized sections split at paragraph/line boundaries.
export const chunkMarkdown = (markdown: string, title: string): string[] => {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const sections = body.split(/\n(?=## )/);
  const result: string[] = [];
  for (const section of sections) {
    let buffer = '';
    for (const line of section.split('\n')) {
      if (buffer.length + line.length > 2800 && buffer) {
        result.push(`${title}\n\n${buffer.trim()}`);
        buffer = '';
      }
      // Bound even a malformed single very long line without losing characters.
      for (let start = 0; start < line.length || start === 0; start += 2600) {
        const part = line.slice(start, start + 2600);
        if (buffer.length + part.length > 2800 && buffer) {
          result.push(`${title}\n\n${buffer.trim()}`);
          buffer = '';
        }
        buffer += `${part}\n`;
      }
    }
    if (buffer.trim()) result.push(`${title}\n\n${buffer.trim()}`);
  }
  return result;
};
