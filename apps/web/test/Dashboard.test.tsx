import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../src/features/operations/Dashboard.js';
import { useOperations } from '../src/features/operations/use-operations.js';

vi.mock('../src/features/operations/use-operations.js');
const hook = vi.mocked(useOperations);
const blank = { calls: [], inquiries: [], events: [], tools: [], evidence: [], knowledge: [] };
const state = {
  ready: true,
  signedIn: false,
  data: null,
  error: '',
  updated: null,
  busy: false,
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
};
beforeEach(() => {
  hook.mockReturnValue(state);
});
describe('protected activity dashboard', () => {
  it('shows sign-in rather than customer records before authentication', () => {
    render(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'Administrator sign-in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('heading', { name: 'Call activity' })).not.toBeInTheDocument();
  });
  it('has honest empty states and labels polling, not a fabricated live stream', () => {
    hook.mockReturnValue({ ...state, signedIn: true, data: blank, updated: '12:00:00' });
    render(<Dashboard />);
    expect(screen.getByText('No inquiries recorded.')).toBeInTheDocument();
    expect(screen.getByText('No calls received.')).toBeInTheDocument();
    expect(screen.getByText(/this is not a live transcript stream/)).toBeInTheDocument();
  });
  it('distinguishes imported records, real provider activity, and unverified extractions', () => {
    hook.mockReturnValue({
      ...state,
      signedIn: true,
      data: {
        ...blank,
        calls: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            code: 'CALL-001',
            status: 'completed',
            record_source: 'imported_history',
            started_at: '2026-10-24T10:00:00Z',
            summary: 'Imported fixture',
            provider_execution_id: null,
          },
        ],
      },
    });
    render(<Dashboard />);
    expect(screen.getByText(/completed · Imported history/)).toBeInTheDocument();
    expect(screen.getByText(/Unverified provider observations/)).toBeInTheDocument();
  });
  it('shows an explicit refresh/access error rather than invented success', () => {
    hook.mockReturnValue({ ...state, error: 'An active administrator profile is required.' });
    render(<Dashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('administrator profile');
  });
});
