import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { useVoiceCall } from '../src/features/voice/use-voice-call.js';
vi.mock('../src/features/voice/use-voice-call.js');
const start = vi.fn();
vi.mocked(useVoiceCall).mockReturnValue({
  phase: 'idle',
  muted: false,
  level: 0,
  error: '',
  connectedAt: null,
  endedAt: null,
  ready: true,
  elapsed: 0,
  start,
  end: vi.fn(),
  toggleMute: vi.fn(),
  reload: vi.fn(),
});
describe('public consultancy website', () => {
  it('renders approved public company content without internal diagnostics or a named agent', () => {
    const { container } = render(<App />);
    expect(screen.getByRole('heading', { name: /Your next chapter/ })).toBeInTheDocument();
    expect(screen.getByText('₹15,000–35,000')).toBeInTheDocument();
    expect(screen.getByText('DispatchPro for SwiftRoute Logistics')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Anjali|not connected|API reachable|integration readiness/i,
    );
    expect(
      screen.getByText('AsterByte Solutions is a fictional demonstration consultancy.'),
    ).toBeInTheDocument();
  });
  it('opens and closes the mobile navigation with semantic controls', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
  });
  it('requires deliberate consent before starting and does not start on render', async () => {
    start.mockClear();
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: 'Start a conversation' });
    expect(button).toBeDisabled();
    expect(start).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /I agree to microphone/ }));
    await user.click(button);
    expect(start).toHaveBeenCalledWith(true);
  });
  it('exposes policy details without booking, email or contact-form controls', async () => {
    render(<App />);
    await userEvent.setup().click(screen.getByText('Will I own the source code?'));
    expect(screen.getByText(/Client-specific custom code belongs to you/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Book|Send email|Submit/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Administrator access/ })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});
