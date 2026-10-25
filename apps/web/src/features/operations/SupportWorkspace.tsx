import { useEffect, useRef, useState } from 'react';
import { Search, X, RefreshCw } from 'lucide-react';
import type { SupportDashboard } from '@asterbyte/contracts';
import { Badge } from './Badge.js';
import { label, matches, time } from './presentation.js';
import { RecordRow, RecordButton } from './RecordRow.js';

type Ticket = SupportDashboard['tickets'][number];
const mailLabel = (status: string) =>
  status === 'succeeded'
    ? 'Accepted by Resend'
    : status === 'failed'
      ? 'Not sent / needs attention'
      : status === 'processing'
        ? 'Sending'
        : 'Queued';
export const SupportWorkspace = ({
  data,
  onUpdate,
  onRetry,
}: {
  data: SupportDashboard;
  onUpdate: (id: string, status: string, resolution: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState('open');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const open = selected !== null;
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const ticket = data.tickets.find((t) => t.id === selected);
  const show = (t: Ticket) => {
    setStatus(t.status);
    setResolution(t.resolution_summary ?? '');
    setError('');
    setSelected(t.id);
  };
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError('The change could not be confirmed. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  };
  const tickets = data.tickets.filter(
    (t) =>
      matches(
        query,
        t.code,
        t.title,
        t.description,
        t.projects.name,
        t.projects.support_code,
        t.customer_accounts.support_code,
        t.customer_accounts.display_name,
      ) &&
      (filter === 'all' || t.status === filter),
  );
  return (
    <>
      <div className="workspace-toolbar">
        <label className="search-field">
          <Search size={17} />
          <span className="sr-only">Search support tickets</span>
          <input
            type="search"
            placeholder="Search tickets, customer or project codes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="filter-field">
          <span className="sr-only">Filter support status</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {[
              'open',
              'triaged',
              'in_progress',
              'waiting_customer',
              'waiting_provider',
              'resolved',
              'closed',
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="snapshot-scope">
        {tickets.length} shown · {data.tickets.length} recent tickets
      </p>
      <section className="workspace-panel table-panel">
        <header>
          <h2>Support tickets</h2>
        </header>
        {tickets.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Project / customer</th>
                  <th>Status</th>
                  <th>Reported</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <RecordRow key={t.id} onOpen={() => show(t)}>
                    <td>
                      <RecordButton onOpen={() => show(t)}>{t.title}</RecordButton>
                      <p className="cell-muted">
                        {t.code} · {t.priority}
                      </p>
                      <p className="cell-summary">{t.description}</p>
                    </td>
                    <td>
                      <p>{t.projects.name}</p>
                      <p className="cell-muted">
                        Project {t.projects.support_code ?? '—'} · Customer{' '}
                        {t.customer_accounts.support_code ?? '—'}
                      </p>
                    </td>
                    <td>
                      <Badge value={t.status} />
                    </td>
                    <td className="date-cell">{time(t.reported_at)}</td>
                  </RecordRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-empty">
            <h3>No matching support tickets</h3>
            <p>Confirmed voice support requests appear here after they are saved.</p>
          </div>
        )}
      </section>
      <dialog
        className="record-dialog"
        ref={dialog}
        aria-labelledby="support-heading"
        onClose={() => setSelected(null)}
        onCancel={() => setSelected(null)}
      >
        <header className="detail-header">
          <p className="eyebrow">SUPPORT REQUEST</p>
          <button
            className="icon-button"
            aria-label="Close support details"
            onClick={() => setSelected(null)}
          >
            <X size={20} />
          </button>
        </header>
        <div className="detail-body">
          <h2 id="support-heading">{ticket?.title ?? 'Ticket outside current snapshot'}</h2>
          {ticket && (
            <>
              <div className="detail-status">
                <Badge value={ticket.status} />
                <span>
                  {ticket.code} · {ticket.priority}
                </span>
              </div>
              <dl>
                {[
                  [
                    'Project',
                    `${ticket.projects.name} · ${ticket.projects.support_code ?? 'No short code'}`,
                  ],
                  [
                    'Customer',
                    `${ticket.customer_accounts.display_name} · ${ticket.customer_accounts.support_code ?? 'No short code'}`,
                  ],
                  ['Reported by', ticket.contacts.full_name],
                  ['Assigned engineer', ticket.employees.full_name],
                  ['Access evidence', label(ticket.intake_identity_status)],
                  ['Reported', time(ticket.reported_at)],
                  ['Issue notes', ticket.description],
                ].map(([name, value]) => (
                  <div className="detail-field" key={name}>
                    <dt>{name}</dt>
                    <dd className="preserve-text">{value}</dd>
                  </div>
                ))}
              </dl>
              <form
                className="support-update"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() => onUpdate(ticket.id, status, resolution));
                }}
              >
                <h3>Investigation & resolution</h3>
                <label htmlFor="support-status">Status</label>
                <select
                  id="support-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {[
                    'open',
                    'triaged',
                    'in_progress',
                    'waiting_customer',
                    'waiting_provider',
                    'resolved',
                    'closed',
                  ].map((s) => (
                    <option value={s} key={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
                <label htmlFor="support-resolution">Resolution notes</label>
                <textarea
                  id="support-resolution"
                  rows={4}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  required={['resolved', 'closed'].includes(status)}
                  minLength={['resolved', 'closed'].includes(status) ? 5 : undefined}
                  placeholder="Describe what was actually fixed or answered."
                />
                <p className="detail-footnote">
                  Saving as resolved queues an email to the registered contact.
                </p>
                <button className="button button--dark" disabled={busy}>
                  {busy ? 'Saving…' : 'Save ticket update'}
                </button>
              </form>
              <section className="support-deliveries">
                <h3>Email notifications</h3>
                <p className="cell-muted">
                  {ticket.contacts.email_normalized ?? 'No registered email'} ·{' '}
                  {ticket.contacts.support_email_enabled
                    ? 'Sending enabled'
                    : 'Sending disabled for this demo contact'}
                </p>
                {data.emails
                  .filter((e) => e.payload.ticket_id === ticket.id)
                  .map((e) => (
                    <div className="source-reference" key={e.id}>
                      <strong>
                        {e.payload.template === 'support_resolution'
                          ? 'Resolution notice'
                          : 'Acknowledgement'}
                      </strong>
                      <p>
                        {mailLabel(e.status)} · {time(e.created_at)}
                      </p>
                      {e.last_error_code && <p>{label(e.last_error_code)}</p>}
                      {e.status === 'failed' && (
                        <button
                          className="detail-link"
                          disabled={busy}
                          onClick={() => {
                            void act(() => onRetry(e.id));
                          }}
                        >
                          <RefreshCw size={14} /> Retry notification
                        </button>
                      )}
                    </div>
                  ))}
                {!data.emails.some((e) => e.payload.ticket_id === ticket.id) && (
                  <p className="detail-footnote">
                    No notification jobs in this snapshot. Historical seed tickets do not trigger
                    new mail.
                  </p>
                )}
              </section>
            </>
          )}
          {error && (
            <p role="alert" className="workspace-notice workspace-notice--error">
              {error}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
};
