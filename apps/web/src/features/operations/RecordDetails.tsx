import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import type { Dashboard } from '@asterbyte/contracts';
import { knowledgeId, label, time } from './presentation.js';
import { Badge } from './Badge.js';
import type { Selection } from './presentation.js';

const Field = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="detail-field">
    <dt>{name}</dt>
    <dd>{children || 'Not available'}</dd>
  </div>
);
export const RecordDetails = ({
  selection,
  data,
  onClose,
  onSelect,
}: {
  selection: Selection | null;
  data: Dashboard;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
}) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = selection !== null;
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const link = (kind: Selection['kind'], id: string, title: string, exists: boolean) =>
    exists ? (
      <button className="detail-link" onClick={() => onSelect({ kind, id })}>
        {title}
        <ArrowUpRight size={14} />
      </button>
    ) : (
      <span className="mono">
        {id} <small>(outside loaded records)</small>
      </span>
    );
  const call =
    selection?.kind === 'call' ? data.calls.find((item) => item.id === selection.id) : undefined;
  const inquiry =
    selection?.kind === 'inquiry'
      ? data.inquiries.find((item) => item.id === selection.id)
      : undefined;
  const tool =
    selection?.kind === 'tool' ? data.tools.find((item) => item.id === selection.id) : undefined;
  const event =
    selection?.kind === 'event' ? data.events.find((item) => item.id === selection.id) : undefined;
  const knowledge =
    selection?.kind === 'knowledge'
      ? data.knowledge.find((item) => knowledgeId(item) === selection.id)
      : undefined;
  const evidence = call?.provider_execution_id
    ? data.evidence.find((item) => item.execution_id === call.provider_execution_id)
    : undefined;
  const found = call ?? inquiry ?? tool ?? event ?? knowledge;
  return (
    <dialog
      className="record-dialog"
      ref={dialog}
      aria-labelledby="record-heading"
      onClose={onClose}
      onCancel={onClose}
    >
      <header className="detail-header">
        <p className="eyebrow">RECORD DETAILS</p>
        <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="detail-body">
        <h2 id="record-heading">
          {inquiry?.title ??
            call?.code ??
            (tool ? label(tool.tool_name) : knowledge?.title || knowledge?.document_key) ??
            (event ? label(event.event_type) : 'Record details')}
        </h2>
        {!found && (
          <p className="empty-text">
            This record is no longer in the loaded recent snapshot. Close this panel and refresh.
          </p>
        )}
        {call && (
          <>
            <div className="detail-status">
              <Badge value={call.status} />
              <span>
                {call.record_source === 'imported_history' ? 'Imported history' : 'Provider record'}
              </span>
            </div>
            <dl>
              <Field name="Started">{time(call.started_at)}</Field>
              <Field name="Summary">
                <p className="preserve-text">
                  {call.summary || 'A finalized summary is not available yet.'}
                </p>
              </Field>
              {evidence && (
                <>
                  <Field name="Provider status">{label(evidence.provider_status)}</Field>
                  <Field name="Conversation duration">
                    {evidence.conversation_duration} seconds
                  </Field>
                  <Field name="Extraction observations">
                    <div className="observation-note">Caller-provided / unverified</div>
                    {Object.keys(evidence.contact_observations).length
                      ? Object.entries(evidence.contact_observations).map(([key, value]) => (
                          <p key={key}>
                            <strong>{label(key)}: </strong>
                            {typeof value === 'string' ? value : 'Not available'}
                          </p>
                        ))
                      : 'No contact observations available.'}
                  </Field>
                </>
              )}
              <Field name="Stored inquiry links">
                {data.inquiries.some((item) => item.source_call_id === call.id)
                  ? data.inquiries
                      .filter((item) => item.source_call_id === call.id)
                      .map((item) => (
                        <div key={item.id}>{link('inquiry', item.id, item.title, true)}</div>
                      ))
                  : 'No stored inquiry link in this snapshot.'}
              </Field>
            </dl>
            <details className="technical-details">
              <summary>Technical provenance</summary>
              <dl>
                <Field name="Call ID">
                  <span className="mono">{call.id}</span>
                </Field>
                <Field name="Provider execution ID">
                  <span className="mono">
                    {call.provider_execution_id || 'None — imported history'}
                  </span>
                </Field>
              </dl>
            </details>
          </>
        )}
        {inquiry && (
          <>
            <div className="detail-status">
              <Badge value={inquiry.stage} />
              <span>
                {inquiry.import_batch ? 'Imported history' : 'Voice intake · identity unverified'}
              </span>
            </div>
            <dl>
              <Field name="Reference">
                <span className="mono">{inquiry.code}</span>
              </Field>
              <Field name="Received">{time(inquiry.created_at)}</Field>
              <Field name="Requirements">
                <p className="preserve-text">{inquiry.requirements}</p>
              </Field>
              {['customer_name', 'organization', 'email', 'phone', 'budget', 'timeline'].map(
                (key) => (
                  <Field key={key} name={label(key)}>
                    {typeof inquiry.intake_details[key] === 'string'
                      ? inquiry.intake_details[key]
                      : null}
                  </Field>
                ),
              )}
              <Field name="Source call">
                {inquiry.source_call_id
                  ? link(
                      'call',
                      inquiry.source_call_id,
                      'Open linked call',
                      data.calls.some((item) => item.id === inquiry.source_call_id),
                    )
                  : 'No stored call association.'}
              </Field>
            </dl>
            <details className="technical-details">
              <summary>Intake provenance</summary>
              <dl>
                {['identity_status', 'confirmation_source', 'call_link_status'].map((key) => (
                  <Field key={key} name={label(key)}>
                    {typeof inquiry.intake_details[key] === 'string'
                      ? label(inquiry.intake_details[key])
                      : null}
                  </Field>
                ))}
              </dl>
            </details>
          </>
        )}
        {tool && (
          <>
            <div className="detail-status">
              <Badge value={tool.status} />
            </div>
            <dl>
              <Field name="Attempted">{time(tool.created_at)}</Field>
              <Field name="Error code">{tool.error_code || 'No error recorded'}</Field>
              <Field name="Stored inquiry link">
                {tool.inquiry_id
                  ? link(
                      'inquiry',
                      tool.inquiry_id,
                      'Open created inquiry',
                      data.inquiries.some((item) => item.id === tool.inquiry_id),
                    )
                  : 'No inquiry link recorded.'}
              </Field>
              <Field name="Retrieved sources">
                {tool.source_ids.length
                  ? tool.source_ids.map((id) => {
                      const source = data.sources.find((item) => item.id === id);
                      return (
                        <div className="source-reference" key={id}>
                          {source ? (
                            <>
                              <strong>{source.title}</strong>
                              <p>
                                {source.document_key} · v{source.version} · passage{' '}
                                {source.chunk_index + 1}
                              </p>
                            </>
                          ) : (
                            <p className="mono">{id} — metadata unavailable</p>
                          )}
                        </div>
                      );
                    })
                  : 'No retrieved passages recorded for this attempt.'}
              </Field>
              <Field name="Attempt ID">
                <span className="mono">{tool.id}</span>
              </Field>
            </dl>
          </>
        )}
        {event && (
          <dl>
            <Field name="Event">{label(event.event_type)}</Field>
            <Field name="Occurred">{time(event.occurred_at)}</Field>
            <Field name="Description">{event.description}</Field>
            <Field name="Call link">
              {event.call_id
                ? link(
                    'call',
                    event.call_id,
                    'Open related call',
                    data.calls.some((item) => item.id === event.call_id),
                  )
                : 'No stored call link.'}
            </Field>
          </dl>
        )}
        {knowledge && (
          <>
            <div className="detail-status">
              <Badge value={knowledge.approval_status} />
            </div>
            <dl>
              <Field name="Document">{knowledge.document_key}</Field>
              <Field name="Version">{knowledge.version}</Field>
              <Field name="Visibility">{knowledge.visibility || 'Not provided'}</Field>
              <Field name="Approved">{time(knowledge.approved_at)}</Field>
              <Field name="Source path">
                <span className="mono">{knowledge.source_path}</span>
              </Field>
            </dl>
            <p className="detail-footnote">
              Catalog approval is separate from embedding coverage. Source versions shown in tool
              results identify the passages actually retrieved.
            </p>
          </>
        )}
      </div>
    </dialog>
  );
};
