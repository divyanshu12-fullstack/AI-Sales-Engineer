import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardSchema } from '@asterbyte/contracts';
import { Dashboard } from '../src/features/operations/Dashboard.js';
import { useOperations } from '../src/features/operations/use-operations.js';
import { dashboardFixture } from './fixture.js';
vi.mock('../src/features/operations/use-operations.js');
const hook = vi.mocked(useOperations);
const state = {
  ready: true,
  signedIn: true,
  data: dashboardFixture,
  error: '',
  updated: '2026-10-24T10:00:00Z',
  busy: false,
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  access: 'ready' as const,
  refresh: vi.fn(),
};
beforeEach(() => {
  hook.mockReturnValue(state);
});
describe('administrator operations workspace', () => {
  it('preserves protected sign-in rather than displaying data before authentication', () => {
    hook.mockReturnValue({ ...state, signedIn: false, data: null });
    render(<Dashboard />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory & order workflow')).not.toBeInTheDocument();
  });
  it('labels bounded counts and polling rather than global metrics or live transcripts', () => {
    render(<Dashboard />);
    expect(screen.getByText(/Counts describe the loaded snapshot only/)).toBeInTheDocument();
    expect(screen.getByText(/Polling updates, not a live transcript stream/)).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed/)).toBeInTheDocument();
  });
  it('filters loaded calls by source and status and shows recoverable empty results', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Calls' }));
    await user.selectOptions(screen.getByLabelText('Filter by source'), 'imported');
    expect(screen.getByText('CALL-IMPORTED-EXAMPLE')).toBeInTheDocument();
    expect(screen.queryByText('CALL-BROWSER-EXAMPLE')).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'no-such-call');
    expect(screen.getByRole('heading', { name: 'No matching calls' })).toBeInTheDocument();
  });
  it('inspects available summaries/extractions without inferring a matching inquiry link', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: /Caller discussed an inventory/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('caller@example.invalid')).toBeInTheDocument();
    expect(
      within(dialog).getByText('No stored inquiry link in this snapshot.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Caller-provided / unverified')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps a selected status filter visible when polling removes its last matching record', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Dashboard />);
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Calls' }));
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'failed');
    hook.mockReturnValue({
      ...state,
      data: {
        ...dashboardFixture,
        calls: dashboardFixture.calls.filter((call) => call.status !== 'failed'),
      },
    });
    rerender(<Dashboard />);
    expect(screen.getByLabelText('Filter by status')).toHaveValue('failed');
    expect(screen.getByRole('heading', { name: 'No matching calls' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'all');
    expect(screen.getByText('CALL-BROWSER-EXAMPLE')).toBeInTheDocument();
  });
  it('shows source/version evidence for actual tool source IDs', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Tools & activity' }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'View tool attempt 40000000-0000-4000-8000-000000000001',
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByText('services-pricing · v1.1 · passage 1'),
    ).toBeInTheDocument();
  });
  it('shows only real stored inquiry-call links and unverified intake details', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole('button', { name: /INCOMING INQUIRY.*Inventory/ }));
    expect(
      within(screen.getByRole('dialog')).getByText('No stored call association.'),
    ).toBeInTheDocument();
  });
  it('provides refresh, stale, expired and forbidden states without displaying private rows after denial', async () => {
    hook.mockReturnValue({
      ...state,
      access: 'forbidden',
      data: null,
      error: 'Access restricted by administrator policy.',
    });
    render(<Dashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Access restricted');
    expect(
      screen.getByRole('heading', { name: 'Administrator access is required.' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('caller@example.invalid')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    expect(state.refresh).toHaveBeenCalled();
  });
  it('handles an empty authorized snapshot without sample activity', () => {
    hook.mockReturnValue({
      ...state,
      data: dashboardSchema.parse({
        calls: [],
        inquiries: [],
        tools: [],
        events: [],
        evidence: [],
        knowledge: [],
      }),
    });
    render(<Dashboard />);
    expect(screen.getByText('No calls in this snapshot')).toBeInTheDocument();
    expect(screen.getByText('No inquiries yet')).toBeInTheDocument();
  });
});
