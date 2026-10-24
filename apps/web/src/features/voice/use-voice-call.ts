import { useCallback, useEffect, useRef, useState } from 'react';
import type { BolnaWebCall, BolnaWebCallOptions } from '@bolna/web-call';
import { ApiRequestError, mintBrowserSession } from '../../lib/http.js';

type VoiceClient = Pick<
  BolnaWebCall,
  'on' | 'off' | 'start' | 'stop' | 'setMuted' | 'isMuted' | 'getRunId'
>;
type Factory = (options: BolnaWebCallOptions) => VoiceClient;
export type VoicePhase = 'idle' | 'permission' | 'connecting' | 'connected' | 'ended' | 'failed';
const messages: Record<string, string> = {
  microphone_denied:
    'Microphone access was blocked or no microphone was found. Allow it in your browser’s site settings, check your device, then retry.',
  connect_failed:
    'The call could not connect. Check your connection, disable a restrictive VPN if needed, and try again.',
  call_rejected: 'The voice service could not accept this call. Please try again shortly.',
  autoplay_blocked:
    'Your browser blocked the call audio. End the call and start again using the call button.',
  at_capacity: 'All voice lines are busy. Please try again shortly.',
  mint_failed: 'We could not prepare your call. Check your connection and try again shortly.',
};
const empty = {
  phase: 'idle' as VoicePhase,
  muted: false,
  level: 0,
  error: '',
  connectedAt: null as number | null,
  endedAt: null as number | null,
};

export const useVoiceCall = () => {
  const [state, setState] = useState(empty);
  const [ready, setReady] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const factory = useRef<Factory | null>(null);
  const current = useRef<{
    client: VoiceClient;
    abort: AbortController;
    dispose: () => void;
  } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    // Preload code only, never mint or request microphone on page load. start() stays in the click gesture.
    void import('@bolna/web-call')
      .then(({ BolnaWebCall: Client }) => {
        if (cancelled) return;
        factory.current = (options) => new Client(options);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setState({
            ...empty,
            phase: 'failed',
            error: 'The voice interface could not load. Please reload it and try again.',
          });
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      const attempt = current.current;
      current.current = null;
      attempt?.abort.abort();
      attempt?.dispose();
      void attempt?.client.stop().catch(() => {});
    };
  }, [loadVersion]);
  useEffect(() => {
    if (state.phase !== 'connected') return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.phase]);

  const start = useCallback((consent: boolean) => {
    if (!factory.current || current.current || !consent) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState({
        ...empty,
        phase: 'failed',
        error:
          'Voice calls need a supported browser with a microphone on HTTPS (or localhost). Please open the secure site and retry.',
      });
      return;
    }
    const abort = new AbortController();
    let sessionError = '';
    let settled = false;
    setState({ ...empty, phase: 'connecting' });
    const client = factory.current({
      debug: false,
      getSession: async () => {
        let session;
        try {
          session = await mintBrowserSession(abort.signal);
        } catch (error) {
          sessionError =
            error instanceof ApiRequestError && error.status === 429
              ? 'Too many call attempts or all lines are busy. Please wait a few minutes before trying again.'
              : error instanceof ApiRequestError && error.status === 503
                ? 'Browser calling is temporarily unavailable. Please try again later.'
                : (messages.mint_failed ?? '');
          throw error;
        }
        if (abort.signal.aborted) throw new Error('Call cancelled');
        if (mounted.current) setState((previous) => ({ ...previous, phase: 'permission' }));
        return session;
      },
    });
    const isCurrent = () => mounted.current && current.current?.client === client;
    const finish = (failed: boolean, error = '') => {
      if (!isCurrent() || settled) return;
      settled = true;
      setState((previous) => ({
        ...previous,
        phase: failed ? 'failed' : 'ended',
        level: 0,
        endedAt: Date.now(),
        error,
      }));
      abort.abort();
      current.current?.dispose();
      current.current = null;
    };
    const onPermission = () => {
      if (isCurrent()) setState((p) => ({ ...p, phase: 'connecting' }));
    };
    const onStart = () => {
      if (isCurrent()) {
        const connectedAt = Date.now();
        setNow(connectedAt);
        setState((p) => ({ ...p, phase: 'connected', connectedAt, endedAt: null }));
      }
    };
    const onEnd = ({ reason }: { reason: string }) =>
      finish(
        reason === 'failed',
        reason === 'failed' ? 'The connection ended unexpectedly. Please try again.' : '',
      );
    const onError = ({ code }: { code: string }) => {
      finish(
        true,
        sessionError || messages[code] || 'The call could not continue. Please try again.',
      );
      void client.stop().catch(() => {});
    };
    const onLevel = (level: number) => {
      if (isCurrent() && Number.isFinite(level))
        setState((p) =>
          p.phase === 'connected' ? { ...p, level: Math.max(0, Math.min(1, level)) } : p,
        );
    };
    const dispose = () => {
      client.off('media-permission', onPermission);
      client.off('call-start', onStart);
      client.off('call-end', onEnd);
      client.off('error', onError);
      client.off('volume-level', onLevel);
    };
    current.current = { client, abort, dispose };
    client
      .on('media-permission', onPermission)
      .on('call-start', onStart)
      .on('call-end', onEnd)
      .on('error', onError)
      .on('volume-level', onLevel);
    // No await/import before SDK start: preserve browser audio user activation.
    void client.start().catch(() => {
      if (!settled) onError({ code: 'connect_failed' });
    });
  }, []);
  const end = useCallback(() => {
    const attempt = current.current;
    if (!attempt) return;
    attempt.abort.abort();
    void attempt.client
      .stop()
      .catch(() => {
        if (mounted.current)
          setState((p) => ({
            ...p,
            phase: 'failed',
            endedAt: Date.now(),
            level: 0,
            error: 'The call could not close cleanly. Close this tab to release the connection.',
          }));
      })
      .finally(() => {
        attempt.dispose();
        if (current.current === attempt) current.current = null;
      });
  }, []);
  const toggleMute = useCallback(() => {
    const client = current.current?.client;
    if (!client) return;
    client.setMuted(!client.isMuted());
    setState((p) => ({ ...p, muted: client.isMuted() }));
  }, []);
  const elapsed =
    state.connectedAt === null
      ? 0
      : Math.max(0, Math.floor(((state.endedAt ?? now) - state.connectedAt) / 1000));
  return {
    ...state,
    ready,
    elapsed,
    start,
    end,
    toggleMute,
    reload: () => {
      setReady(false);
      setState(empty);
      setLoadVersion((n) => n + 1);
    },
  };
};
