import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOperations } from '../src/features/operations/use-operations.js';
import { dashboardFixture } from './fixture.js';

const auth = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: { access_token: string } | null) => void),
  unsubscribe: vi.fn(),
  stop: vi.fn(() => Promise.resolve()),
  signIn: vi.fn(),
  signOut: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    auth.create(...args);
    return {
      auth: {
        onAuthStateChange: (callback: typeof auth.callback) => {
          auth.callback = callback;
          return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
        },
        stopAutoRefresh: auth.stop,
        signInWithPassword: auth.signIn,
        signOut: auth.signOut,
      },
    };
  },
}));
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.clearAllMocks();
  auth.callback = null;
  auth.signIn.mockImplementation(() => {
    auth.callback?.('SIGNED_IN', { access_token: 'test-access-token' });
    return Promise.resolve({ error: null });
  });
  auth.signOut.mockImplementation(() => {
    auth.callback?.('SIGNED_OUT', null);
    return Promise.resolve({ error: null });
  });
});
afterEach(() => {
  vi.useRealTimers();
});
describe('in-memory administrator session and polling', () => {
  it('keeps authentication in memory and does not request business data before sign-in', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        response({ url: 'https://auth.example.invalid', publishableKey: 'test-public-key' }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const { result, unmount } = renderHook(useOperations);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(auth.create).toHaveBeenCalledWith('https://auth.example.invalid', 'test-public-key', {
      auth: { persistSession: false, detectSessionInUrl: false },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.signedIn).toBe(false);
    expect(result.current.data).toBeNull();
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
    expect(auth.stop).toHaveBeenCalled();
  });
  it.each([401, 403])(
    'clears all private data when the authorized endpoint returns %s',
    async (status) => {
      const fetch = vi.fn((path: string) =>
        Promise.resolve(
          path === '/api/auth/config'
            ? response({ url: 'https://auth.example.invalid', publishableKey: 'test-public-key' })
            : response({}, status),
        ),
      );
      vi.stubGlobal('fetch', fetch);
      const { result } = renderHook(useOperations);
      await waitFor(() => expect(result.current.ready).toBe(true));
      await act(async () => {
        await result.current.signIn('review@example.invalid', 'not-a-real-password');
      });
      await waitFor(() =>
        expect(result.current.access).toBe(status === 401 ? 'expired' : 'forbidden'),
      );
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeTruthy();
    },
  );
  it('retains a labeled stale snapshot on network failure and can refresh without overlapping requests', async () => {
    let fail = false;
    const fetch = vi.fn((path: string) =>
      path === '/api/auth/config'
        ? Promise.resolve(
            response({ url: 'https://auth.example.invalid', publishableKey: 'test-public-key' }),
          )
        : fail
          ? Promise.reject(new Error('network'))
          : Promise.resolve(response({ data: dashboardFixture })),
    );
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useOperations);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.signIn('review@example.invalid', 'not-a-real-password');
    });
    await waitFor(() => expect(result.current.access).toBe('ready'));
    const previous = result.current.data;
    fail = true;
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.access).toBe('stale'));
    expect(result.current.data).toEqual(previous);
    expect(result.current.error).toContain('may be stale');
    fail = false;
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.access).toBe('ready'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.signedIn).toBe(false);
  });
  it('aborts pending business requests on unmount', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, options: RequestInit) => {
        if (path === '/api/auth/config')
          return Promise.resolve(
            response({ url: 'https://auth.example.invalid', publishableKey: 'test-public-key' }),
          );
        signal = options.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );
    const { result, unmount } = renderHook(useOperations);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.signIn('review@example.invalid', 'not-a-real-password');
    });
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
  it('does not clear a valid snapshot on a repeated same-session sign-in event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          response(
            path === '/api/auth/config'
              ? { url: 'https://auth.example.invalid', publishableKey: 'test-public-key' }
              : { data: dashboardFixture },
          ),
        ),
      ),
    );
    const { result } = renderHook(useOperations);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.signIn('review@example.invalid', 'not-a-real-password');
    });
    await waitFor(() => expect(result.current.access).toBe('ready'));
    act(() => {
      auth.callback?.('SIGNED_IN', { access_token: 'test-access-token' });
    });
    expect(result.current.access).toBe('ready');
    expect(result.current.data).toEqual(dashboardFixture);
  });
  it('polls after three seconds and does not overlap a pending authenticated request', async () => {
    let requests = 0;
    let complete: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string, options: RequestInit) => {
        if (path === '/api/auth/config')
          return Promise.resolve(
            response({ url: 'https://auth.example.invalid', publishableKey: 'test-public-key' }),
          );
        expect(options.headers).toEqual({ Authorization: 'Bearer test-access-token' });
        requests++;
        if (requests === 2)
          return new Promise<Response>((resolve) => {
            complete = resolve;
          });
        return Promise.resolve(response({ data: dashboardFixture }));
      }),
    );
    const { result } = renderHook(useOperations);
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    await act(async () => {
      await result.current.signIn('review@example.invalid', 'not-a-real-password');
    });
    expect(requests).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(requests).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(requests).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(requests).toBe(2);
    await act(async () => {
      complete?.(response({ data: dashboardFixture }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(requests).toBe(3);
  });
  it('reports sign-out network failure without an unhandled rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          response(
            path === '/api/auth/config'
              ? { url: 'https://auth.example.invalid', publishableKey: 'test-public-key' }
              : { data: dashboardFixture },
          ),
        ),
      ),
    );
    const { result } = renderHook(useOperations);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.signIn('review@example.invalid', 'not-a-real-password');
    });
    auth.signOut.mockRejectedValueOnce(new Error('Private SDK failure'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.error).toContain('close this tab');
    expect(result.current.error).not.toContain('Private SDK failure');
  });
});
