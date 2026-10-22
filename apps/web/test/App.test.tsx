import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { statusResponse } from './fixtures.js';

describe('foundation screen', () => {
  it('starts with a loading state and does not request microphone access', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Checking API…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voice calling unavailable' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled();
  });

  it('distinguishes a reachable backend from unavailable integrations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => Promise.resolve(statusResponse(path))),
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'API reachable' })).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Voice calling unavailable' })).toBeDisabled();
  });

  it('shows a recoverable network error and performs real requests when retried', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network unavailable.'));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The API could not be reached');
    fetchMock.mockImplementation((path: string) => Promise.resolve(statusResponse(path)));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('heading', { name: 'API reachable' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects malformed responses rather than displaying invented health', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
      ),
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'API reachable' })).not.toBeInTheDocument();
  });

  it('aborts outstanding requests when the screen unmounts', () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_path: string, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return new Promise<Response>(() => {});
      }),
    );
    const { unmount } = render(<App />);
    unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
