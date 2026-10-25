import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { supportDashboardSchema } from '@asterbyte/contracts';
import { SupportWorkspace } from '../src/features/operations/SupportWorkspace.js';
const id = '00000000-0000-4000-8000-000000000001';
const data = supportDashboardSchema.parse({
  tickets: [
    {
      id,
      code: 'SUP-DEMO',
      title: 'Appointment screen is empty',
      description: 'The receptionist cannot see bookings this morning.',
      priority: 'P3',
      status: 'open',
      reported_at: '2026-10-25T10:00:00Z',
      resolution_summary: null,
      resolved_at: null,
      intake_identity_status: 'demo_code_match',
      import_batch: null,
      projects: { name: 'Demo appointment system', support_code: '9002' },
      customer_accounts: { display_name: 'Demo account', support_code: '9001' },
      contacts: {
        full_name: 'Demo customer',
        email_normalized: 'customer@example.invalid',
        support_email_enabled: false,
      },
      employees: { full_name: 'Assigned engineer' },
    },
  ],
  emails: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      status: 'failed',
      attempts: 5,
      last_error_code: 'EMAIL_RECIPIENT_DISABLED',
      provider_message_id: null,
      created_at: '2026-10-25T10:00:00Z',
      payload: { ticket_id: id, template: 'support_acknowledgement' },
    },
  ],
});
describe('support operations workspace', () => {
  it('shows loaded tickets and code filters without pretending demo matches verify a customer', async () => {
    const user = userEvent.setup();
    render(<SupportWorkspace data={data} onUpdate={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByText(/1 shown · 1 recent tickets/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), '9002');
    expect(screen.getByText('Appointment screen is empty')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'wrong code');
    expect(screen.getByText('No matching support tickets')).toBeInTheDocument();
  });
  it('collects real resolution notes and exposes notification failure/retry separately from ticket status', async () => {
    const user = userEvent.setup();
    const update = vi.fn(() => Promise.resolve());
    const retry = vi.fn(() => Promise.resolve());
    render(<SupportWorkspace data={data} onUpdate={update} onRetry={retry} />);
    await user.click(screen.getByRole('button', { name: 'Appointment screen is empty' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Not sent \/ needs attention/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'resolved');
    await user.type(
      within(dialog).getByLabelText('Resolution notes'),
      'Corrected the appointment filter and verified the result.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save ticket update' }));
    expect(update).toHaveBeenCalledWith(
      id,
      'resolved',
      'Corrected the appointment filter and verified the result.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Retry notification' }));
    expect(retry).toHaveBeenCalledWith(data.emails[0]?.id);
    await user.click(within(dialog).getByRole('button', { name: 'Close support details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
