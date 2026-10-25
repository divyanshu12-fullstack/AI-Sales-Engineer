import type { Dashboard } from '@asterbyte/contracts';
export type View =
  'overview' | 'calls' | 'inquiries' | 'activity' | 'knowledge' | 'support' | 'meetings';
export type Selection = {
  kind: 'call' | 'inquiry' | 'tool' | 'event' | 'knowledge' | 'meeting';
  id: string;
};
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
export const callLabel = (call: Dashboard['calls'][number]) =>
  call.provider_execution_id ?? call.code;
export const duration = (seconds: number | null) =>
  seconds === null
    ? '—'
    : `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')}`;
export const potentialLeads = (data: Dashboard) =>
  data.inquiries.filter((i) => !['won', 'lost'].includes(i.stage));
export const pendingTickets = (data: Dashboard) =>
  data.support.tickets.filter((t) => !['resolved', 'closed'].includes(t.status));
