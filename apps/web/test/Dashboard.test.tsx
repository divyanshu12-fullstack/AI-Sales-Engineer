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
  updateTicket: vi.fn(() => Promise.resolve()),
  retrySupportEmail: vi.fn(() => Promise.resolve()),
  loadKnowledge: vi.fn(() =>
    Promise.resolve({
      id: '70000000-0000-4000-8000-000000000001',
      title: 'Services',
      version: '1.1',
      document_key: 'services-pricing',
      content_markdown: '# Services\n\nApproved company services.',
      content_sha256: 'a'.repeat(64),
    }),
  ),
};
beforeEach(() => {
  hook.mockReturnValue(state);
});
describe('administrator operations workspace', () => {
  it('preserves protected sign-in rather than displaying data before authentication', () => {
    hook.mockReturnValue({ ...state, signedIn: false, data: null });
    render(<Dashboard />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Demo sign-in credentials')).toHaveTextContent(
      'admin123@gmail.com',
    );
    expect(screen.getByLabelText('Demo sign-in credentials')).toHaveTextContent('Admin@12345');
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory & order workflow')).not.toBeInTheDocument();
  });
  it('labels bounded counts and polling rather than global metrics or live transcripts', () => {
    render(<Dashboard />);
    expect(screen.queryByText('YOUR OPERATIONS WORKSPACE')).not.toBeInTheDocument();
    expect(screen.getByText('Recent Calls')).toBeInTheDocument();
    expect(screen.getByText('Last 30 calls')).toBeInTheDocument();
    expect(screen.getByText('Potential Leads')).toBeInTheDocument();
    expect(screen.getByText('Pending Tickets')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Meetings')).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed/)).toBeInTheDocument();
  });
  it('shows a reserved consultation as pending until the customer confirms by email', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Meetings' }),
    );
    await user.click(screen.getByRole('button', { name: 'CRM workflow consultation' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Pending Confirmation')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Confirmation pending — slot reserved until the customer confirms by email',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Calendar reference/)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /20000000-0000-4000-8000-000000000001/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('caller@example.invalid')).toBeInTheDocument();
    expect(within(dialog).getByText('No linked inquiry in recent records.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('As reported by the caller · not verified'),
    ).toBeInTheDocument();
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
    expect(screen.getByText('20000000-0000-4000-8000-000000000001')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /VOICE INQUIRY.*Inventory/ }));
    expect(within(screen.getByRole('dialog')).getByText('No linked call.')).toBeInTheDocument();
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
    expect(screen.getByText('No calls yet')).toBeInTheDocument();
    expect(screen.getByText('No open leads')).toBeInTheDocument();
  });
  it('opens a call from the row, shows full IDs with real duration and keeps summaries in the panel', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Calls' }));
    expect(screen.getByText('20000000-0000-4000-8000-000000000001')).toHaveAttribute(
      'title',
      '20000000-0000-4000-8000-000000000001',
    );
    expect(screen.queryByText(dashboardFixture.calls[0]?.summary ?? '')).not.toBeInTheDocument();
    await user.click(screen.getByText('2:23'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Caller discussed an inventory');
  });
  it('separates requested meetings from confirmed upcoming appointments', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    const card = screen.getByRole('button', { name: /Upcoming Meetings/ });
    expect(card).toHaveTextContent('2 awaiting confirmation');
    await user.click(card);
    await user.click(screen.getByText('Product consultation request'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Awaiting confirmation — not booked yet');
  });
  it('loads actual document text on demand inside the knowledge detail', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Knowledge status' }),
    );
    await user.click(screen.getByRole('button', { name: /Services, pricing and delivery/ }));
    expect(await screen.findByText('Approved company services.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Download Markdown' }),
    ).toBeEnabled();
  });
});
