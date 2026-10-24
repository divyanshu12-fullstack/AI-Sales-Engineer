import { HttpError } from '../http/errors.js';

// Never propagate provider response bodies: they can contain credentials or caller data.
export const fetchJson = async (
  url: string | URL,
  init: RequestInit = {},
  timeout = 15_000,
): Promise<unknown> => {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      if (response.status === 409)
        throw new HttpError(
          409,
          'CONFLICT',
          'This submission key was already used with different details.',
        );
      throw new HttpError(502, 'UPSTREAM_ERROR', 'An upstream service rejected the request.');
    }
    const body: unknown = await response.json();
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      502,
      'UPSTREAM_ERROR',
      'An upstream service timed out or returned an invalid response.',
    );
  }
};
