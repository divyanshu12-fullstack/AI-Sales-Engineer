import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import type { CallEvidenceDetails, Dashboard, KnowledgeDocument } from '@asterbyte/contracts';
import { ApiRequestError } from '../../lib/http.js';
import { knowledgeId, label, time, callLabel, duration } from './presentation.js';
import { KnowledgeReader } from './KnowledgeReader.js';
import { Badge } from './Badge.js';
import type { Selection } from './presentation.js';

const Field = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="detail-field">
    <dt>{name}</dt>
    <dd>{children ?? 'Not available'}</dd>
  </div>
);
const CallArtifacts = ({
  executionId,
  fallbackSummary,
  loadEvidence,
  loadRecording,
}: {
  executionId: string;
  fallbackSummary: string;
  loadEvidence: (executionId: string, signal: AbortSignal) => Promise<CallEvidenceDetails>;
  loadRecording: (executionId: string, signal: AbortSignal) => Promise<Blob>;
}) => {
  const [evidence, setEvidence] = useState<CallEvidenceDetails | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [evidenceError, setEvidenceError] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const recordingController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadEvidence(executionId, controller.signal)
      .then((details) => setEvidence(details))
      .catch(() => {
        if (!controller.signal.aborted) setEvidenceError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEvidenceLoading(false);
      });
    return () => {
      controller.abort();
      recordingController.current?.abort();
    };
  }, [executionId, loadEvidence]);

  useEffect(
    () => () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    },
    [recordingUrl],
  );

  const fetchRecording = async () => {
    recordingController.current?.abort();
    const controller = new AbortController();
    recordingController.current = controller;
    setRecordingLoading(true);
    setRecordingError('');
    try {
      const blob = await loadRecording(executionId, controller.signal);
      if (controller.signal.aborted) return;
      setRecordingUrl(URL.createObjectURL(blob));
    } catch (error) {
      if (controller.signal.aborted) return;
      setRecordingError(
        error instanceof ApiRequestError && error.status === 404
          ? 'No recording is available for this call.'
          : 'The recording could not be loaded. Please try again.',
      );
    } finally {
      if (!controller.signal.aborted) setRecordingLoading(false);
    }
  };

  return (
    <>
      <Field name="Full call summary">
        <p className="preserve-text">
          {evidence?.summary || fallbackSummary || 'No summary returned by Bolna.'}
        </p>
      </Field>
      <Field name="Bolna extractions">
        {evidence ? (
          Object.keys(evidence.extracted_data).length ? (
            <pre className="preserve-text call-extraction-json">
              {JSON.stringify(evidence.extracted_data, null, 2)}
            </pre>
          ) : (
            'Bolna returned no extractions for this call.'
          )
        ) : evidenceLoading ? (
          'Loading call extractions…'
        ) : evidenceError ? (
          'Call extractions could not be loaded. Reopen the call to try again.'
        ) : (
          'Bolna returned no extractions for this call.'
        )}
      </Field>
      <Field name="Voice recording">
        {recordingUrl ? (
          <audio
            aria-label="Call recording player"
            className="call-recording-player"
            controls
            preload="metadata"
            src={recordingUrl}
          >
            Audio playback is not supported by this browser.
          </audio>
        ) : (
          <button
            className="call-recording-load"
            type="button"
            disabled={recordingLoading}
            onClick={() => void fetchRecording()}
          >
            {recordingLoading ? 'Loading recording…' : 'Load call recording'}
          </button>
        )}
        {recordingError && (
          <p role="status" className="call-recording-error">
            {recordingError}
          </p>
        )}
      </Field>
    </>
  );
};
export const RecordDetails = ({
  selection,
  data,
  onClose,
  onSelect,
  loadDocument,
  loadCallEvidence,
  loadCallRecording,
}: {
  selection: Selection | null;
  data: Dashboard;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  loadDocument: (id: string, signal: AbortSignal) => Promise<KnowledgeDocument>;
  loadCallEvidence: (executionId: string, signal: AbortSignal) => Promise<CallEvidenceDetails>;
  loadCallRecording: (executionId: string, signal: AbortSignal) => Promise<Blob>;
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
  const meeting =
    selection?.kind === 'meeting'
      ? data.meetings.find((item) => item.id === selection.id)
      : undefined;
  const evidence = call?.provider_execution_id
    ? data.evidence.find((item) => item.execution_id === call.provider_execution_id)
    : undefined;
  const found = call ?? inquiry ?? tool ?? event ?? knowledge ?? meeting;
  return (
    <dialog
      className="record-dialog"
      ref={dialog}
      aria-labelledby="record-heading"
      onClose={onClose}
      onCancel={onClose}
    >
      <header className="detail-header">
        <p className="eyebrow">
          {selection
            ? {
                call: 'CALL DETAILS',
                inquiry: 'PROJECT INQUIRY',
                tool: 'TOOL RESULT',
                event: 'ACTIVITY',
                knowledge: 'KNOWLEDGE DOCUMENT',
                meeting: 'MEETING',
              }[selection.kind]
            : 'DETAILS'}
        </p>
        <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="detail-body">
        <h2 id="record-heading">
          {inquiry?.title ??
            (call ? callLabel(call) : undefined) ??
            meeting?.title ??
            (tool ? label(tool.tool_name) : knowledge?.title || knowledge?.document_key) ??
            (event ? label(event.event_type) : 'Record details')}
        </h2>
        {!found && (
          <p className="empty-text">
            This record is no longer in the recent list. Refresh to check again.
          </p>
        )}
        {call && (
          <>
            <div className="detail-status">
              <Badge value={call.status} />
              <span>
                {call.record_source === 'imported_history' ? 'Imported history' : 'Bolna call'}
              </span>
            </div>
            <dl>
              <Field name="Started">{time(call.started_at)}</Field>
              <Field name="Duration">{duration(call.duration_seconds)}</Field>
              {call.channel && (
                <Field name="Channel">
                  {label(call.channel)}
                  {call.direction ? ` · ${label(call.direction)}` : ''}
                </Field>
              )}
              {call.provider_execution_id ? (
                <CallArtifacts
                  key={call.id}
                  executionId={call.provider_execution_id}
                  fallbackSummary={call.summary || evidence?.summary || ''}
                  loadEvidence={loadCallEvidence}
                  loadRecording={loadCallRecording}
                />
              ) : (
                <Field name="Full call summary">
                  <p className="preserve-text">{call.summary || 'No summary yet.'}</p>
                </Field>
              )}
              {evidence && (
                <>
                  <Field name="Provider status">{label(evidence.provider_status)}</Field>
                  <Field name="Contact details from call">
                    <div className="observation-note">As reported by the caller · not verified</div>
                    {Object.keys(evidence.contact_observations).length
                      ? Object.entries(evidence.contact_observations).map(([key, value]) => (
                          <p key={key}>
                            <strong>{label(key)}: </strong>
                            {typeof value === 'string' ? value : 'Not available'}
                          </p>
                        ))
                      : 'No contact details captured.'}
                  </Field>
                </>
              )}
              <Field name="Linked inquiries">
                {data.inquiries.some((item) => item.source_call_id === call.id)
                  ? data.inquiries
                      .filter((item) => item.source_call_id === call.id)
                      .map((item) => (
                        <div key={item.id}>{link('inquiry', item.id, item.title, true)}</div>
                      ))
                  : 'No linked inquiry in recent records.'}
              </Field>
            </dl>
            <details className="technical-details">
              <summary>Record identifiers</summary>
              <dl>
                <Field name="Database record ID">
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
              <Field name="Project brief">
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
                  : 'No linked call.'}
              </Field>
            </dl>
            <details className="technical-details">
              <summary>How this inquiry was recorded</summary>
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
              {tool.error_code && <Field name="Error">{tool.error_code}</Field>}
              <Field name="Created inquiry">
                {tool.inquiry_id
                  ? link(
                      'inquiry',
                      tool.inquiry_id,
                      'Open created inquiry',
                      data.inquiries.some((item) => item.id === tool.inquiry_id),
                    )
                  : 'None'}
              </Field>
              <Field name="Retrieved sources">
                {tool.source_ids.length
                  ? tool.source_ids.map((id) => {
                      const source = data.sources.find((item) => item.id === id);
                      return (
                        <div className="source-reference" key={id}>
                          {source ? (
                            <>
                              <button
                                className="detail-link"
                                onClick={() =>
                                  onSelect({
                                    kind: 'knowledge',
                                    id: `${source.document_key}@${source.version}`,
                                  })
                                }
                              >
                                {source.title}
                                <ArrowUpRight size={14} />
                              </button>
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
                  : 'No knowledge passages used.'}
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
                : 'No linked call.'}
            </Field>
          </dl>
        )}
        {knowledge && (
          <>
            <div className="detail-status">
              <Badge value={knowledge.approval_status} />
            </div>
            <div className="knowledge-summary">
              <span>Version {knowledge.version}</span>
              <span>
                {knowledge.visibility ? label(knowledge.visibility) : 'Visibility unavailable'}
              </span>
              <span>{knowledge.indexed_passages} indexed passages</span>
            </div>
            {knowledge.id ? (
              <KnowledgeReader key={knowledge.id} id={knowledge.id} load={loadDocument} />
            ) : (
              <p className="detail-footnote">Document preview is unavailable for this record.</p>
            )}
            <details className="technical-details">
              <summary>Source details</summary>
              <dl>
                <Field name="Document key">{knowledge.document_key}</Field>
                <Field name="Approved">{time(knowledge.approved_at)}</Field>
                <Field name="Source path">
                  <span className="mono">{knowledge.source_path}</span>
                </Field>
              </dl>
            </details>
          </>
        )}
        {meeting && (
          <>
            <div className="detail-status">
              <Badge value={meeting.status} />
              {meeting.status === 'requested' && (
                <span>Awaiting confirmation — not booked yet</span>
              )}
              {meeting.status === 'pending_confirmation' && (
                <span>
                  {meeting.confirmation_expired
                    ? 'Confirmation link expired — this slot is available again'
                    : 'Confirmation pending — slot reserved until the customer confirms by email'}
                </span>
              )}
              {meeting.status === 'confirmed' && meeting.provider === 'customer_confirmation' && (
                <span>Confirmed by the customer through the emailed link</span>
              )}
            </div>
            <dl>
              <Field name="When">{time(meeting.requested_start_at)}</Field>
              <Field name="Meeting timezone">{meeting.timezone}</Field>
              <Field name="Duration">{meeting.duration_minutes} minutes</Field>
              <Field name="Host">{meeting.employees?.full_name ?? 'Unassigned'}</Field>
              {meeting.confirmation_sent_at && (
                <Field name="Confirmation email accepted">
                  {time(meeting.confirmation_sent_at)}
                </Field>
              )}
              {meeting.status === 'pending_confirmation' && !meeting.confirmation_sent_at && (
                <Field name="Confirmation email">Provider acceptance not recorded</Field>
              )}
              {meeting.inquiry_id && (
                <Field name="Project inquiry">
                  {link(
                    'inquiry',
                    meeting.inquiry_id,
                    'Open inquiry',
                    data.inquiries.some((i) => i.id === meeting.inquiry_id),
                  )}
                </Field>
              )}
              <Field name="Reference">{meeting.code}</Field>
              {meeting.status === 'confirmed' && meeting.meet_url && (
                <Field name="Google Meet">
                  <a
                    className="detail-link"
                    href={meeting.meet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Join Google Meet <ArrowUpRight size={14} />
                  </a>
                </Field>
              )}
              {meeting.provider_event_id && meeting.provider !== 'customer_confirmation' && (
                <Field name="Calendar reference">
                  {meeting.provider} · {meeting.provider_event_id}
                </Field>
              )}
              {meeting.status === 'confirmed' && meeting.confirmed_at && (
                <Field name="Customer confirmed">{time(meeting.confirmed_at)}</Field>
              )}
            </dl>
          </>
        )}
      </div>
    </dialog>
  );
};
