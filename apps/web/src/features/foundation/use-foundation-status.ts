import { useEffect, useState } from 'react';
import { fetchFoundationStatus } from '../../lib/api.js';
import type { FoundationStatus } from '../../lib/api.js';

type StatusState =
  { status: 'loading' } | { status: 'loaded'; data: FoundationStatus } | { status: 'error' };

export const useFoundationStatus = () => {
  const [state, setState] = useState<StatusState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 5_000);

    void fetchFoundationStatus(controller.signal)
      .then((data) => {
        if (!disposed) setState({ status: 'loaded', data });
      })
      .catch(() => {
        if (!disposed) setState({ status: 'error' });
      })
      .finally(() => {
        clearTimeout(timeout);
        controller.abort();
      });

    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const refresh = (): void => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  };

  return { state, refresh };
};
