import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dashboardSchema } from '@asterbyte/contracts';
import type { Dashboard } from '@asterbyte/contracts';
import { z } from 'zod';

export const useOperations = () => {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let dispose = () => {};
    void (async () => {
      try {
        const response = await fetch('/api/auth/config', { signal: abort.signal });
        if (!response.ok) throw new Error('Sign-in is not configured.');
        const config = z
          .object({ url: z.url(), publishableKey: z.string().min(1) })
          .parse(await response.json());
        if (abort.signal.aborted) return;
        // Public key only. Session stays in memory; never persist bearer/refresh tokens to localStorage.
        const auth = createClient(config.url, config.publishableKey, {
          auth: { persistSession: false, detectSessionInUrl: false },
        });
        const { data: subscription } = auth.auth.onAuthStateChange((_event, session) => {
          setToken(session?.access_token ?? null);
          if (!session) {
            setData(null);
            setUpdated(null);
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
        const response = await fetch('/api/admin/activity', {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if ([401, 403].includes(response.status)) {
          setData(null);
          setError(
            response.status === 403
              ? 'This account is not an active administrator. Ask the project owner to configure admin_profiles.'
              : 'Your session expired. Sign out and sign in again.',
          );
          return;
        }
        if (!response.ok) throw new Error('Dashboard fetch failed.');
        const body = z.object({ data: dashboardSchema }).parse(await response.json());
        if (controller.signal.aborted) return;
        setData(body.data);
        setUpdated(new Date().toLocaleTimeString());
        setError('');
      } catch {
        if (!controller.signal.aborted)
          setError(
            'Refresh failed. Previously loaded records may be stale; retrying automatically.',
          );
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
  }, [token]);

  const signIn = async (email: string, password: string) => {
    if (!client) return;
    setBusy(true);
    setError('');
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
    const result = await client.auth.signOut({ scope: 'local' });
    if (result.error) {
      setError('Sign-out failed; close this tab to clear the in-memory session.');
      return;
    }
    setToken(null);
    setData(null);
    setError('');
  };
  return {
    ready: Boolean(client),
    signedIn: Boolean(token),
    data,
    error,
    updated,
    busy,
    signIn,
    signOut,
  };
};
