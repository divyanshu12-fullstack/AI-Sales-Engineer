import { useState } from 'react';
import {
  ArrowUpRight,
  Search,
  Phone,
  FileText,
  LifeBuoy,
  CalendarDays,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import type { Dashboard } from '@asterbyte/contracts';
import {
  knowledgeId,
  label,
  matches,
  time,
  callLabel,
  duration,
  potentialLeads,
  pendingTickets,
} from './presentation.js';
import { Badge } from './Badge.js';
import { RecordRow, RecordButton } from './RecordRow.js';
import type { Selection, View } from './presentation.js';

const Empty = ({ title, body }: { title: string; body?: string }) => (
  <div className="workspace-empty">
    <Search size={23} strokeWidth={1.5} />
    <h3>{title}</h3>
    {body && <p>{body}</p>}
  </div>
);
export const WorkspaceViews = ({
  view,
  data,
  onSelect,
  onView,
}: {
  view: View;
  data: Dashboard;
  onSelect: (selection: Selection) => void;
  onView: (view: View) => void;
}) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const calls = data.calls.filter(
    (c) =>
      matches(query, c.code, c.summary, c.provider_execution_id) &&
      (status === 'all' || c.status === status) &&
      (source === 'all' || (source === 'imported') === (c.record_source === 'imported_history')),
  );
  const inquiries = data.inquiries.filter(
    (i) =>
      matches(
        query,
        i.code,
        i.title,
        i.requirements,
        ...Object.values(i.intake_details).filter((v): v is string => typeof v === 'string'),
      ) &&
      (status === 'all' || i.stage === status) &&
      (source === 'all' || (source === 'imported') === Boolean(i.import_batch)),
  );
  const tools = data.tools.filter(
    (t) =>
      matches(query, t.tool_name, t.status, t.error_code, t.id) &&
      (status === 'all' || t.status === status),
  );
  const events = data.events.filter((e) => matches(query, e.event_type, e.description));
  const knowledge = data.knowledge.filter(
    (d) =>
      matches(query, d.title, d.document_key, d.version) &&
      (status === 'all' || d.approval_status === status),
  );
  const meetings = data.meetings.filter(
    (m) =>
      matches(query, m.title, m.code, m.employees?.full_name) &&
      (status === 'all' || m.status === status),
  );
  const statuses = [
    ...new Set(
      view === 'calls'
        ? data.calls.map((c) => c.status)
        : view === 'inquiries'
          ? data.inquiries.map((i) => i.stage)
          : view === 'activity'
            ? data.tools.map((t) => t.status)
            : view === 'meetings'
              ? data.meetings.map((m) => m.status)
              : data.knowledge.map((d) => d.approval_status),
    ),
  ];
  if (status !== 'all' && !statuses.includes(status)) statuses.push(status);
  const open = (kind: Selection['kind'], id: string) => () => onSelect({ kind, id });
  const scheduled = data.meetings.filter((m) => m.status === 'confirmed');
  if (view === 'overview')
    return (
      <>
        <div className="metric-grid">
          {[
            {
              title: 'Recent Calls',
              value: data.calls.length,
              detail: 'Last 30 calls',
              icon: Phone,
              target: 'calls' as View,
            },
            {
              title: 'Potential Leads',
              value: potentialLeads(data).length,
              detail: 'Open leads · recent 30 inquiries',
              icon: FileText,
              target: 'inquiries' as View,
            },
            {
              title: 'Pending Tickets',
              value: pendingTickets(data).length,
              detail: 'Unresolved · recent 40 tickets',
              icon: LifeBuoy,
              target: 'support' as View,
            },
            {
              title: 'Upcoming Meetings',
              value: scheduled.length,
              detail: `${data.meetings.filter((m) => ['requested', 'pending_confirmation'].includes(m.status)).length} awaiting confirmation · next 30 records`,
              icon: CalendarDays,
              target: 'meetings' as View,
            },
          ].map(({ title, value, detail, icon: Icon, target }) => (
            <button className="metric-card" key={title} onClick={() => onView(target)}>
              <div>
                <span>{title}</span>
                <Icon size={18} strokeWidth={1.5} />
              </div>
              <strong>{value}</strong>
              <p>{detail}</p>
            </button>
          ))}
        </div>
        <div className="overview-next">
          <span>
            {pendingTickets(data).length
              ? `${pendingTickets(data).length} unresolved ${pendingTickets(data).length === 1 ? 'ticket' : 'tickets'} to follow up`
              : 'No unresolved tickets in recent records'}
          </span>
          <button className="workspace-link" onClick={() => onView('support')}>
            View tickets <ArrowRight size={15} />
          </button>
        </div>
        <div className="overview-grid">
          <section className="workspace-panel">
            <header>
              <h2>Recent calls</h2>
              <button className="workspace-link" onClick={() => onView('calls')}>
                View all <ArrowRight size={15} />
              </button>
            </header>
            {data.calls.length ? (
              <ul className="overview-list">
                {data.calls.slice(0, 5).map((call) => (
                  <li key={call.id}>
                    <button onClick={open('call', call.id)}>
                      <span className="list-record-icon">
                        <Phone size={17} />
                      </span>
                      <div>
                        <strong className="record-id" title={callLabel(call)}>
                          {callLabel(call)}
                        </strong>
                        <p>
                          {time(call.started_at)} · {duration(call.duration_seconds)}
                        </p>
                      </div>
                      <Badge value={call.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No calls yet" />
            )}
          </section>
          <section className="workspace-panel">
            <header>
              <h2>Potential leads</h2>
              <button className="workspace-link" onClick={() => onView('inquiries')}>
                View all <ArrowRight size={15} />
              </button>
            </header>
            {potentialLeads(data).length ? (
              <ul className="overview-inquiries">
                {potentialLeads(data)
                  .slice(0, 4)
                  .map((i) => (
                    <li key={i.id}>
                      <button onClick={open('inquiry', i.id)}>
                        <div>
                          <span>{i.import_batch ? 'IMPORTED' : 'VOICE INQUIRY'}</span>
                          <Badge value={i.stage} />
                        </div>
                        <strong>{i.title}</strong>
                        <p>
                          {typeof i.intake_details.customer_name === 'string'
                            ? i.intake_details.customer_name
                            : i.code}{' '}
                          · {time(i.created_at)}
                        </p>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <Empty title="No open leads" />
            )}
          </section>
        </div>
        <section className="workspace-panel overview-activity">
          <header>
            <h2>Latest activity</h2>
            <button className="workspace-link" onClick={() => onView('activity')}>
              View all <ArrowRight size={15} />
            </button>
          </header>
          {data.events.length ? (
            data.events.slice(0, 4).map((e) => (
              <button className="activity-line" key={e.id} onClick={open('event', e.id)}>
                <span className="event-node" />
                <div>
                  <strong>{e.description}</strong>
                  <p>{label(e.event_type)}</p>
                </div>
                <time>{time(e.occurred_at)}</time>
              </button>
            ))
          ) : (
            <Empty title="No activity yet" />
          )}
        </section>
      </>
    );
  return (
    <>
      <div className="workspace-toolbar">
        <label className="search-field">
          <Search size={17} />
          <span className="sr-only">
            Search loaded {view === 'activity' ? 'tools and activity' : view}
          </span>
          <input
            type="search"
            placeholder={`Search ${view === 'inquiries' ? 'leads' : view === 'knowledge' ? 'documents' : view === 'activity' ? 'tools and activity' : view}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="filter-field">
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        {['calls', 'inquiries'].includes(view) && (
          <label className="filter-field">
            <span className="sr-only">Filter by source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">All sources</option>
              <option value="incoming">Voice calls / inquiries</option>
              <option value="imported">Imported history</option>
            </select>
          </label>
        )}
      </div>
      {view === 'calls' && (
        <section className="workspace-panel table-panel calls-table">
          <header>
            <h2>Calls</h2>
            <span className="count-pill">
              {calls.length} shown · {data.calls.length} recent
            </span>
          </header>
          {calls.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Call ID</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th className="optional-column">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <RecordRow key={call.id} onOpen={open('call', call.id)}>
                      <td>
                        <RecordButton
                          label={`View call ${call.code}`}
                          onOpen={open('call', call.id)}
                        >
                          <span className="record-id" title={callLabel(call)}>
                            {callLabel(call)}
                          </span>
                        </RecordButton>
                      </td>
                      <td className="date-cell">{time(call.started_at)}</td>
                      <td>{duration(call.duration_seconds)}</td>
                      <td>
                        <Badge value={call.status} />
                      </td>
                      <td className="optional-column cell-muted">
                        {call.channel ? label(call.channel) : '—'}
                      </td>
                    </RecordRow>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No matching calls" body="Try another search or clear the filters." />
          )}
        </section>
      )}
      {view === 'inquiries' && (
        <section className="workspace-panel table-panel">
          <header>
            <h2>Project inquiries</h2>
            <span className="count-pill">
              {inquiries.length} shown · {data.inquiries.length} recent
            </span>
          </header>
          {inquiries.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Contact</th>
                    <th>Received</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((i) => (
                    <RecordRow key={i.id} onOpen={open('inquiry', i.id)}>
                      <td>
                        <RecordButton onOpen={open('inquiry', i.id)}>{i.title}</RecordButton>
                        <p className="cell-muted">{i.code}</p>
                      </td>
                      <td>
                        {typeof i.intake_details.customer_name === 'string'
                          ? i.intake_details.customer_name
                          : '—'}
                      </td>
                      <td className="date-cell">{time(i.created_at)}</td>
                      <td>
                        <Badge value={i.stage} />
                      </td>
                    </RecordRow>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No matching inquiries" body="Try another search or clear the filters." />
          )}
        </section>
      )}
      {view === 'meetings' && (
        <section className="workspace-panel table-panel">
          <header>
            <h2>Upcoming meetings</h2>
            <span className="count-pill">{meetings.length} shown · up to 30 upcoming records</span>
          </header>
          {meetings.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Meeting</th>
                    <th>When</th>
                    <th>Host</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m) => (
                    <RecordRow key={m.id} onOpen={open('meeting', m.id)}>
                      <td>
                        <RecordButton onOpen={open('meeting', m.id)}>{m.title}</RecordButton>
                        <p className="cell-muted">{m.duration_minutes} min</p>
                      </td>
                      <td className="date-cell">{time(m.requested_start_at)}</td>
                      <td>{m.employees?.full_name ?? 'Unassigned'}</td>
                      <td>
                        <Badge value={m.status} />
                      </td>
                    </RecordRow>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No upcoming meetings"
              body="Meeting requests and confirmed appointments will appear here when recorded."
            />
          )}
        </section>
      )}
      {view === 'activity' && (
        <div className="activity-view">
          <section className="workspace-panel table-panel">
            <header>
              <h2>Tool results</h2>
              <span className="count-pill">
                {tools.length} shown · {data.tools.length} recent
              </span>
            </header>
            {tools.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Time</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((t) => (
                      <RecordRow key={t.id} onOpen={open('tool', t.id)}>
                        <td>
                          <RecordButton
                            label={`View tool attempt ${t.id}`}
                            onOpen={open('tool', t.id)}
                          >
                            {label(t.tool_name)}
                          </RecordButton>
                          <p className="cell-muted">
                            {t.error_code ?? `${t.source_ids.length} source passages`}
                          </p>
                        </td>
                        <td className="date-cell">{time(t.created_at)}</td>
                        <td>
                          <Badge value={t.status} />
                        </td>
                      </RecordRow>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No matching tool results" />
            )}
          </section>
          <section className="workspace-panel">
            <header>
              <h2>Activity</h2>
              <span className="count-pill">
                {events.length} shown · {data.events.length} recent
              </span>
            </header>
            {events.length ? (
              events.map((e) => (
                <button className="activity-line" key={e.id} onClick={open('event', e.id)}>
                  <span className="event-node" />
                  <div>
                    <strong>{e.description}</strong>
                    <p>{label(e.event_type)}</p>
                  </div>
                  <time>{time(e.occurred_at)}</time>
                </button>
              ))
            ) : (
              <Empty title="No matching activity" />
            )}
          </section>
        </div>
      )}
      {view === 'knowledge' && (
        <>
          <div className="knowledge-summary">
            <span>
              <strong>
                {data.knowledge.filter((d) => d.approval_status === 'approved').length}
              </strong>{' '}
              approved documents
            </span>
            <span>
              <strong>{data.knowledge.reduce((n, d) => n + d.indexed_passages, 0)}</strong> indexed
              passages in preview
            </span>
            <span>Read-only · approval changes are managed separately</span>
          </div>
          <section className="knowledge-grid">
            {knowledge.length ? (
              knowledge.map((doc) => (
                <button
                  className="knowledge-card"
                  key={knowledgeId(doc)}
                  onClick={open('knowledge', knowledgeId(doc))}
                >
                  <div>
                    <BookOpen size={21} strokeWidth={1.5} />
                    <Badge value={doc.approval_status} />
                  </div>
                  <h2>{doc.title || label(doc.document_key)}</h2>
                  <p>
                    {doc.indexed_passages} indexed passages ·{' '}
                    {doc.visibility ? label(doc.visibility) : 'Visibility unavailable'}
                  </p>
                  <footer>
                    <span>Version {doc.version}</span>
                    <span>
                      Read document <ArrowUpRight size={16} />
                    </span>
                  </footer>
                </button>
              ))
            ) : (
              <Empty title="No matching documents" />
            )}
          </section>
        </>
      )}
      <details className="scope-details">
        <summary>Record coverage</summary>
        <p>
          Search and counts use the records loaded here: 30 recent calls and inquiries, 40 tool
          results and events, 40 tickets and up to 30 future meeting records. Knowledge index counts
          preview up to 1,000 passage metadata records. Imported records are included; requested
          meetings are not confirmed bookings.
        </p>
      </details>
    </>
  );
};
