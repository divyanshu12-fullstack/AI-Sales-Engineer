import { useState } from 'react';
import {
  ArrowUpRight,
  Search,
  Phone,
  FileText,
  Activity,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import type { Dashboard } from '@asterbyte/contracts';
import { knowledgeId, label, matches, shortId, time } from './presentation.js';
import { Badge } from './Badge.js';
import type { Selection, View } from './presentation.js';

const Empty = ({ title, body }: { title: string; body: string }) => (
  <div className="workspace-empty">
    <Search size={23} strokeWidth={1.5} />
    <h3>{title}</h3>
    <p>{body}</p>
  </div>
);
const ViewRecord = ({ title, onClick }: { title: string; onClick: () => void }) => (
  <button className="row-open" aria-label={title} onClick={onClick}>
    <ArrowUpRight size={18} />
  </button>
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
  const statuses = [
    ...new Set(
      view === 'calls'
        ? data.calls.map((c) => c.status)
        : view === 'inquiries'
          ? data.inquiries.map((i) => i.stage)
          : view === 'activity'
            ? data.tools.map((t) => t.status)
            : data.knowledge.map((d) => d.approval_status),
    ),
  ];
  // Polling can remove the last row for a selected status; keep the filter visible and clearable.
  if (status !== 'all' && !statuses.includes(status)) statuses.push(status);
  if (view === 'overview')
    return (
      <>
        <div className="metric-grid">
          {[
            {
              title: 'Recent calls',
              value: data.calls.length,
              detail: `${data.calls.filter((c) => c.record_source === 'provider').length} provider records`,
              icon: Phone,
              target: 'calls' as View,
            },
            {
              title: 'Project inquiries',
              value: data.inquiries.length,
              detail: `${data.inquiries.filter((i) => !i.import_batch).length} incoming voice inquiries`,
              icon: FileText,
              target: 'inquiries' as View,
            },
            {
              title: 'Tool attempts',
              value: data.tools.length,
              detail: `${data.tools.filter((t) => t.status === 'failed').length} failed attempts`,
              icon: Activity,
              target: 'activity' as View,
            },
            {
              title: 'Knowledge versions',
              value: data.knowledge.length,
              detail: `${data.knowledge.filter((d) => d.approval_status === 'approved').length} approved in catalog`,
              icon: BookOpen,
              target: 'knowledge' as View,
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
        <p className="snapshot-scope">
          Counts describe the loaded snapshot only: up to 30 calls, 30 inquiries and 40 tool
          attempts. Imported history is included unless labeled otherwise.
        </p>
        <div className="overview-grid">
          <section className="workspace-panel">
            <header>
              <div>
                <h2>Recent conversations</h2>
                <p>From the latest loaded calls</p>
              </div>
              <button className="workspace-link" onClick={() => onView('calls')}>
                View calls <ArrowRight size={15} />
              </button>
            </header>
            {data.calls.length ? (
              <ul className="overview-list">
                {data.calls.slice(0, 5).map((call) => (
                  <li key={call.id}>
                    <button onClick={() => onSelect({ kind: 'call', id: call.id })}>
                      <span className="list-record-icon">
                        <Phone size={17} />
                      </span>
                      <div>
                        <strong>
                          {call.summary
                            ? `${call.summary.slice(0, 60)}${call.summary.length > 60 ? '…' : ''}`
                            : 'Conversation awaiting summary'}
                        </strong>
                        <p>
                          {time(call.started_at)} ·{' '}
                          {call.record_source === 'imported_history' ? 'Imported' : 'Provider'}
                        </p>
                      </div>
                      <Badge value={call.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="No calls in this snapshot"
                body="Stored calls will appear here after they are received."
              />
            )}
          </section>
          <section className="workspace-panel">
            <header>
              <div>
                <h2>Project opportunities</h2>
                <p>New work, ready for review</p>
              </div>
              <button className="workspace-link" onClick={() => onView('inquiries')}>
                View all <ArrowRight size={15} />
              </button>
            </header>
            {data.inquiries.length ? (
              <ul className="overview-inquiries">
                {data.inquiries.slice(0, 4).map((inquiry) => (
                  <li key={inquiry.id}>
                    <button onClick={() => onSelect({ kind: 'inquiry', id: inquiry.id })}>
                      <div>
                        <span>
                          {inquiry.import_batch ? 'IMPORTED HISTORY' : 'INCOMING INQUIRY'}
                        </span>
                        <Badge value={inquiry.stage} />
                      </div>
                      <strong>{inquiry.title}</strong>
                      <p>
                        {inquiry.requirements.slice(0, 105)}
                        {inquiry.requirements.length > 105 ? '…' : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="No inquiries yet"
                body="Confirmed project inquiries will appear here."
              />
            )}
          </section>
        </div>
        <section className="workspace-panel overview-activity">
          <header>
            <div>
              <h2>Latest activity</h2>
              <p>Committed business events</p>
            </div>
            <button className="workspace-link" onClick={() => onView('activity')}>
              All activity <ArrowRight size={15} />
            </button>
          </header>
          {data.events.length ? (
            data.events.slice(0, 4).map((event) => (
              <button
                className="activity-line"
                key={event.id}
                onClick={() => onSelect({ kind: 'event', id: event.id })}
              >
                <span className="event-node" />
                <div>
                  <strong>{event.description}</strong>
                  <p>{label(event.event_type)}</p>
                </div>
                <time>{time(event.occurred_at)}</time>
              </button>
            ))
          ) : (
            <Empty
              title="No activity recorded"
              body="Business events will appear after a committed action."
            />
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
            placeholder={`Search ${view === 'activity' ? 'tools and activity' : view}…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="filter-field">
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
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
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="all">All sources</option>
              <option value="incoming">Incoming / provider</option>
              <option value="imported">Imported history</option>
            </select>
          </label>
        )}
      </div>
      <p className="snapshot-scope">
        Search and filters apply only to currently loaded records, not the entire database.
      </p>
      {view === 'calls' && (
        <section className="workspace-panel table-panel">
          <header>
            <h2>
              Calls{' '}
              <span className="count-pill">
                {calls.length} shown / {data.calls.length} loaded
              </span>
            </h2>
          </header>
          {calls.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Call</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th className="optional-column">Source</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td>
                        <button
                          className="record-name"
                          onClick={() => onSelect({ kind: 'call', id: call.id })}
                        >
                          {shortId(call.code)}
                        </button>
                        <p className="cell-summary">{call.summary || 'Summary pending'}</p>
                      </td>
                      <td className="date-cell">{time(call.started_at)}</td>
                      <td>
                        <Badge value={call.status} />
                      </td>
                      <td className="optional-column cell-muted">
                        {call.record_source === 'imported_history'
                          ? 'Imported history'
                          : 'Provider record'}
                      </td>
                      <td>
                        <ViewRecord
                          title={`View call ${call.code}`}
                          onClick={() => onSelect({ kind: 'call', id: call.id })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No matching calls"
              body="Try a different filter or search term. Only the recent loaded calls are searched."
            />
          )}
        </section>
      )}
      {view === 'inquiries' && (
        <section className="workspace-panel table-panel">
          <header>
            <h2>
              Project inquiries{' '}
              <span className="count-pill">
                {inquiries.length} shown / {data.inquiries.length} loaded
              </span>
            </h2>
          </header>
          {inquiries.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Opportunity</th>
                    <th>Received</th>
                    <th>Stage</th>
                    <th className="optional-column">Source</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((inquiry) => (
                    <tr key={inquiry.id}>
                      <td>
                        <button
                          className="record-name"
                          onClick={() => onSelect({ kind: 'inquiry', id: inquiry.id })}
                        >
                          {inquiry.title}
                        </button>
                        <p className="cell-summary">{inquiry.requirements}</p>
                      </td>
                      <td className="date-cell">{time(inquiry.created_at)}</td>
                      <td>
                        <Badge value={inquiry.stage} />
                      </td>
                      <td className="optional-column cell-muted">
                        {inquiry.import_batch ? 'Imported history' : 'Voice intake'}
                      </td>
                      <td>
                        <ViewRecord
                          title={`View inquiry ${inquiry.title}`}
                          onClick={() => onSelect({ kind: 'inquiry', id: inquiry.id })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No matching inquiries"
              body="Try clearing the filters. An ordinary conversation does not automatically create an inquiry."
            />
          )}
        </section>
      )}
      {view === 'activity' && (
        <div className="activity-view">
          <section className="workspace-panel table-panel">
            <header>
              <div>
                <h2>
                  Tool attempts{' '}
                  <span className="count-pill">
                    {tools.length} shown / {data.tools.length} loaded
                  </span>
                </h2>
                <p>Backend outcomes; no assumed call association</p>
              </div>
            </header>
            {tools.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Attempted</th>
                      <th>Outcome</th>
                      <th>
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => (
                      <tr key={tool.id}>
                        <td>
                          <button
                            className="record-name"
                            onClick={() => onSelect({ kind: 'tool', id: tool.id })}
                          >
                            {label(tool.tool_name)}
                          </button>
                          <p className="cell-muted">
                            {tool.source_ids.length} source passages
                            {tool.error_code ? ` · ${tool.error_code}` : ''}
                          </p>
                        </td>
                        <td className="date-cell">{time(tool.created_at)}</td>
                        <td>
                          <Badge value={tool.status} />
                        </td>
                        <td>
                          <ViewRecord
                            title={`View tool attempt ${tool.id}`}
                            onClick={() => onSelect({ kind: 'tool', id: tool.id })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No matching tool attempts"
                body="Tools appear when the backend receives a real invocation."
              />
            )}
          </section>
          <section className="workspace-panel">
            <header>
              <div>
                <h2>Business activity</h2>
                <p>
                  {events.length} shown / {data.events.length} loaded · status filter applies to
                  tool attempts only
                </p>
              </div>
            </header>
            {events.length ? (
              events.map((event) => (
                <button
                  className="activity-line"
                  key={event.id}
                  onClick={() => onSelect({ kind: 'event', id: event.id })}
                >
                  <span className="event-node" />
                  <div>
                    <strong>{event.description}</strong>
                    <p>{label(event.event_type)}</p>
                  </div>
                  <time>{time(event.occurred_at)}</time>
                </button>
              ))
            ) : (
              <Empty
                title="No matching activity"
                body="Try another search, or wait for a committed business action."
              />
            )}
          </section>
        </div>
      )}
      {view === 'knowledge' && (
        <section className="knowledge-grid">
          {knowledge.length ? (
            knowledge.map((doc) => (
              <button
                className="knowledge-card"
                key={knowledgeId(doc)}
                onClick={() => onSelect({ kind: 'knowledge', id: knowledgeId(doc) })}
              >
                <div>
                  <BookOpen size={21} strokeWidth={1.5} />
                  <Badge value={doc.approval_status} />
                </div>
                <h2>{doc.title || label(doc.document_key)}</h2>
                <p>{doc.document_key}</p>
                <footer>
                  <span>
                    Version {doc.version}
                    {doc.visibility ? ` · ${label(doc.visibility)}` : ''}
                  </span>
                  <ArrowUpRight size={18} />
                </footer>
              </button>
            ))
          ) : (
            <Empty
              title="No matching documents"
              body="Search the loaded knowledge catalog by title, key or version."
            />
          )}
        </section>
      )}
    </>
  );
};
