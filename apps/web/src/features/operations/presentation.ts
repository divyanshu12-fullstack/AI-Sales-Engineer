import type { Dashboard } from '@asterbyte/contracts';
export type View = 'overview' | 'calls' | 'inquiries' | 'activity' | 'knowledge';
export type Selection = { kind: 'call' | 'inquiry' | 'tool' | 'event' | 'knowledge'; id: string };
export const label = (value: string): string =>
  value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
export const time = (value: string | null): string =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Not available';
export const shortId = (value: string): string =>
  value.length > 22 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
export const knowledgeId = (doc: Dashboard['knowledge'][number]) =>
  `${doc.document_key}@${doc.version}`;
export const matches = (query: string, ...values: (string | null | undefined)[]): boolean =>
  !query.trim() ||
  values.some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()));
