import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Dashboard } from '@asterbyte/contracts';
import {
  ApiRequestError,
  getActivity,
  getAuthConfig,
  updateSupportTicket,
  retrySupportEmail,
  getKnowledgeDocument,
} from '../../lib/http.js';

export const useOperations = () => {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState<
    'loading' | 'ready' | 'stale' | 'expired' | 'forbidden' | 'signed_out'
  >('signed_out');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const currentToken = useRef<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let dispose = () => {};
    void (async () => {
      try {
        const config = await getAuthConfig(abort.signal);
        if (abort.signal.aborted) return;
        // Public key only. Session stays in memory; never persist bearer/refresh tokens to localStorage.
        const auth = createClient(config.url, config.publishableKey, {
          auth: { persistSession: false, detectSessionInUrl: false },
        });
        const { data: subscription } = auth.auth.onAuthStateChange((event, session) => {
          const nextToken = session?.access_token ?? null;
          const changed = currentToken.current !== nextToken;
          currentToken.current = nextToken;
          setToken(nextToken);
          if (session && changed) setAccess('loading');
          if (event === 'SIGNED_IN' && changed) setData(null);
          if (!session) {
            setData(null);
            setUpdated(null);
            setAccess('signed_out');
          }
        });
        dispose = () => {
          subscription.subscription.unsubscribe();
          void auth.auth.stopAutoRefresh();
        };
        setClient(auth);
      } catch {
        if (!abort.signal.aborted)
          setError('Administrator sign-in is unavailable. Check the backend configuration.');
      }
    })();
    return () => {
      abort.abort();
      dispose();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const snapshot = await getActivity(token, controller.signal);
        if (controller.signal.aborted) return;
        setData(snapshot);
        setUpdated(new Date().toISOString());
        setAccess('ready');
        setError('');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiRequestError && [401, 403].includes(error.status)) {
          setData(null);
          setAccess(error.status === 403 ? 'forbidden' : 'expired');
          setError(
            error.status === 403
              ? 'This account does not have administrator access. Contact the project owner.'
              : 'Your session expired. Sign out and sign in again.',
          );
          return;
        }
        setAccess('stale');
        setError('Refresh failed. Previously loaded records may be stale; retrying automatically.');
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => {
          void refresh();
        }, 3000);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [token, refreshVersion]);

  const signIn = async (email: string, password: string) => {
    if (!client) return;
    setBusy(true);
    setError('');
    setAccess('signed_out');
    try {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error)
        setError('Sign-in failed. Check your existing administrator account credentials.');
    } catch {
      setError('Sign-in could not reach the authentication service.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    if (!client) return;
    try {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw new Error('Sign-out unavailable');
    } catch {
      setError('Sign-out failed; close this tab to clear the in-memory session.');
      return;
    }
    currentToken.current = null;
    setToken(null);
    setData(null);
    setUpdated(null);
    setAccess('signed_out');
    setError('');
  };
  const loadKnowledge = useCallback(
    async (id: string, signal: AbortSignal) => {
      if (!token) throw new Error('Sign in to continue.');
      return getKnowledgeDocument(token, id, signal);
    },
    [token],
  );
  return {
    loadKnowledge,
    ready: Boolean(client),
    signedIn: Boolean(token),
    data,
    error,
    updated,
    busy,
    signIn,
    signOut,
    updateTicket: async (id: string, status: string, resolution: string) => {
      if (!token) throw new Error('Sign in to continue.');
      await updateSupportTicket(token, id, status, resolution);
      setRefreshVersion((n) => n + 1);
    },
    retrySupportEmail: async (id: string) => {
      if (!token) throw new Error('Sign in to continue.');
      await retrySupportEmail(token, id);
      setRefreshVersion((n) => n + 1);
    },
    access,
    refresh: () => {
      setAccess('loading');
      setRefreshVersion((n) => n + 1);
    },
  };
};
