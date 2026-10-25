import { z } from 'zod';
import {
  browserSessionSchema,
  dashboardSchema,
  knowledgeDocumentSchema,
} from '@asterbyte/contracts';

export class ApiRequestError extends Error {
  constructor(readonly status: number) {
    super('The request could not be completed.');
  }
}
const requestJson = async (path: string, options: RequestInit): Promise<unknown> => {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  const response = await fetch(path, { ...options, signal });
  if (!response.ok) throw new ApiRequestError(response.status);
  const body: unknown = await response.json();
  return body;
};
export const getAuthConfig = async (signal: AbortSignal) =>
  z
    .object({ url: z.url(), publishableKey: z.string().min(1) })
    .parse(await requestJson('/api/auth/config', { signal }));
export const getActivity = async (token: string, signal: AbortSignal) =>
  z.object({ data: dashboardSchema }).parse(
    await requestJson('/api/admin/activity', {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    }),
  ).data;
export const mintBrowserSession = async (signal: AbortSignal) => {
  const session = browserSessionSchema.parse(
    await requestJson('/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true }),
      signal,
    }),
  );
  return {
    ...session,
    ice_servers: session.ice_servers.map(({ urls, username, credential }) => ({
      urls,
      ...(username === undefined ? {} : { username }),
      ...(credential === undefined ? {} : { credential }),
    })),
  };
};
export const updateSupportTicket = async (
  token: string,
  id: string,
  status: string,
  resolution: string,
) => {
  await requestJson(`/api/admin/support/tickets/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, resolution }),
  });
};
export const retrySupportEmail = async (token: string, id: string) => {
  await requestJson(`/api/admin/support/emails/${id}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
};
export const getKnowledgeDocument = async (token: string, id: string, signal: AbortSignal) => {
  const body = await requestJson(`/api/admin/knowledge/${id}`, {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  return z.object({ data: knowledgeDocumentSchema }).parse(body).data;
};
