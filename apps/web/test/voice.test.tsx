import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceCall } from '../src/features/voice/use-voice-call.js';
import { formatDuration } from '../src/features/voice/format.js';
type Handler = (...args: unknown[]) => void;
class TestClient {
  static instances: TestClient[] = [];
  handlers = new Map<string, Handler>();
  muted = false;
  on = vi.fn((name: string, handler: Handler) => {
    this.handlers.set(name, handler);
    return this;
  });
  off = vi.fn((name: string) => {
    this.handlers.delete(name);
    return this;
  });
  start = vi.fn(async () => {});
  stop = vi.fn(() => {
    this.emit('call-end', { reason: 'local-hangup' });
    return Promise.resolve();
  });
  setMuted = vi.fn((muted: boolean) => {
    this.muted = muted;
  });
  isMuted = () => this.muted;
  getRunId = () => null;
  constructor(readonly options: { getSession: () => Promise<unknown> }) {
    TestClient.instances.push(this);
  }
  emit(name: string, ...args: unknown[]) {
    this.handlers.get(name)?.(...args);
  }
}
vi.mock('@bolna/web-call', () => ({ BolnaWebCall: TestClient }));
beforeEach(() => {
  TestClient.instances = [];
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
});
afterEach(() => {
  vi.useRealTimers();
});
const session = {
  run_id: '00000000-0000-4000-8000-000000000001',
  agent_id: '00000000-0000-4000-8000-000000000002',
  sip_username: 'ephemeral',
  sip_password: 'ephemeral',
  sip_domain: 'example.invalid',
  wss_url: 'wss://example.invalid',
  sip_register: false,
  expires_in: 120,
  ice_servers: [],
};
const current = () => {
  const client = TestClient.instances[0];
  if (!client) throw new Error('No test client');
  return client;
};
describe('browser voice lifecycle', () => {
  it('loads SDK code without microphone access, session requests or calls on page load', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useVoiceCall);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(TestClient.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
    act(() => result.current.start(false));
    expect(TestClient.instances).toHaveLength(0);
  });
  it('changes permission/connecting states only around actual mint and permission events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(session)))),
    );
    const { result } = renderHook(useVoiceCall);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.start(true));
    expect(result.current.phase).toBe('connecting');
    await act(async () => {
      await current().options.getSession();
    });
    expect(result.current.phase).toBe('permission');
    act(() => current().emit('media-permission'));
    expect(result.current.phase).toBe('connecting');
    expect(result.current.elapsed).toBe(0);
  });
  it('starts the clock on call-start, drives audio from SDK volume, mutes the real SDK and freezes on end', async () => {
    const { result } = renderHook(useVoiceCall);
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    act(() => result.current.start(true));
    act(() => {
      current().emit('call-start');
      current().emit('volume-level', 0.4);
    });
    expect(result.current.phase).toBe('connected');
    expect(result.current.level).toBe(0.4);
    act(() => {
      vi.advanceTimersByTime(9500);
    });
    expect(result.current.elapsed).toBe(9);
    act(() => result.current.toggleMute());
    expect(current().setMuted).toHaveBeenCalledWith(true);
    expect(result.current.muted).toBe(true);
    act(() => current().emit('call-end', { reason: 'remote-hangup' }));
    expect(result.current.phase).toBe('ended');
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(result.current.elapsed).toBe(9);
    expect(result.current.level).toBe(0);
  });
  it('prevents duplicate starts and releases SDK handlers on cancellation/unmount', async () => {
    const { result, unmount } = renderHook(useVoiceCall);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => {
      result.current.start(true);
      result.current.start(true);
    });
    expect(TestClient.instances).toHaveLength(1);
    const client = current();
    act(() => result.current.end());
    await waitFor(() => expect(result.current.phase).toBe('ended'));
    expect(client.stop).toHaveBeenCalled();
    expect(client.handlers.size).toBe(0);
    act(() => result.current.start(true));
    const second = TestClient.instances[1];
    unmount();
    expect(second?.stop).toHaveBeenCalled();
    expect(second?.handlers.size).toBe(0);
  });
  it('shows safe permission errors, does not leak SDK messages and does not turn a failure into success', async () => {
    const { result } = renderHook(useVoiceCall);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.start(true));
    act(() =>
      current().emit('error', { code: 'microphone_denied', message: 'sensitive raw internals' }),
    );
    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toContain('Microphone access');
    expect(result.current.error).not.toContain('sensitive');
    expect(result.current.elapsed).toBe(0);
  });
  it('handles network/capacity failures and requests a fresh session for another attempt', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}', { status: 429 })));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(useVoiceCall);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.start(true));
    await act(async () => {
      await expect(current().options.getSession()).rejects.toThrow();
      current().emit('error', { code: 'mint_failed' });
    });
    expect(result.current.error).toContain('wait a few minutes');
    act(() => result.current.start(true));
    expect(TestClient.instances).toHaveLength(2);
  });
  it('formats actual elapsed time without assuming a connection', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(143)).toBe('02:23');
  });
});
