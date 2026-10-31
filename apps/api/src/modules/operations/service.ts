import { randomUUID } from 'node:crypto';
import {
  dashboardSchema,
  callEvidenceDetailsSchema,
  inquiryInputSchema,
  inquiryResultSchema,
  knowledgeQuestionSchema,
  knowledgeResultSchema,
  passageSchema,
  supportDashboardSchema,
} from '@asterbyte/contracts';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { Env } from '../../config/env.js';
import { HttpError } from '../../http/errors.js';
import { Database } from '../../lib/database.js';
import { contentHash } from '../knowledge/chunks.js';
import { embed, queryInstruction } from '../knowledge/embeddings.js';
import { getExecution, normalizeExecution } from '../bolna/execution.js';

export const validate = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError(400, 'INVALID_INPUT', 'Request fields are missing or invalid.');
  return result.data;
};

export class Operations {
  readonly database: Database;
  constructor(
    private readonly config: Env,
    private readonly logger: Logger,
  ) {
    this.database = new Database(config);
  }

  private async audit<T>(
    name: string,
    action: () => Promise<T>,
    sources: (result: T) => string[] = () => [],
    inquiryId: (result: T) => string | null = () => null,
  ): Promise<T> {
    const id = randomUUID();
    await this.database.request('tool_executions', { id, tool_name: name, status: 'started' });
    try {
      const result = await action();
      await this.database.request(
        `tool_executions?id=eq.${id}`,
        {
          status: 'succeeded',
          finished_at: new Date().toISOString(),
          source_ids: sources(result),
          inquiry_id: inquiryId(result),
        },
        'PATCH',
      );
      return result;
    } catch (error) {
      // If even the failure audit cannot be stored, retain an explicit failed HTTP result (never success).
      await this.database
        .request(
          `tool_executions?id=eq.${id}`,
          {
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
          },
          'PATCH',
        )
        .catch(() => {
          this.logger.error(
            { event: 'tool_audit_failed', toolInvocationId: id },
            'Tool failure audit could not be stored.',
          );
        });
      throw error;
    }
  }

  async search(input: unknown) {
    const { question } = validate(knowledgeQuestionSchema, input);
    return this.audit(
      'search_company_knowledge',
      async () => {
        const vectors = await embed(this.config, [queryInstruction(question)]);
        const passages = z.array(passageSchema).parse(
          await this.database.rpc('search_company_knowledge', {
            query_embedding: JSON.stringify(vectors[0]),
          }),
        );
        return knowledgeResultSchema.parse({ passages, evidence_only: true });
      },
      (result) => result.passages.map((p) => p.chunk_id),
    );
  }

  async createInquiry(input: unknown) {
    const details = validate(inquiryInputSchema, input);
    if (!this.config.BOLNA_AGENT_ID)
      throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', 'Bolna agent is not configured.');
    return this.audit(
      'create_project_inquiry',
      async () =>
        inquiryResultSchema.parse(
          await this.database.rpc('record_project_inquiry', {
            submission: `${this.config.BOLNA_AGENT_ID}:${details.submission_key}`,
            payload_hash: contentHash(JSON.stringify(details)),
            details,
          }),
        ),
      () => [],
      (result) => result.inquiry_id,
    );
  }

  async webhook(input: unknown) {
    const { id, agent_id } = validate(z.object({ id: z.uuid(), agent_id: z.uuid() }), input);
    if (agent_id !== this.config.BOLNA_AGENT_ID)
      throw new HttpError(403, 'FORBIDDEN', 'Unexpected agent.');
    // Re-fetch authoritative current state: spoofed sample IDs and stale notification bodies do not become evidence.
    const execution = normalizeExecution(await getExecution(id, this.config), this.config);
    const result: unknown = await this.database.rpc('ingest_bolna_execution', {
      evidence: execution,
    });
    return z.object({ accepted: z.literal(true), changed: z.boolean() }).parse(result);
  }

  async callEvidence(executionId: string) {
    const rows = z
      .array(callEvidenceDetailsSchema)
      .parse(
        await this.database.request(
          `call_evidence?select=execution_id,summary,extracted_data&execution_id=eq.${executionId}&limit=1`,
        ),
      );
    if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Call details were not found.');
    return rows[0];
  }

  async callRecording(executionId: string) {
    const records = z
      .array(z.object({ execution_id: z.uuid() }))
      .parse(
        await this.database.request(
          `call_evidence?select=execution_id&execution_id=eq.${executionId}&limit=1`,
        ),
      );
    if (!records.length) throw new HttpError(404, 'NOT_FOUND', 'Call details were not found.');
    if (!this.config.BOLNA_API_KEY)
      throw new HttpError(503, 'INTEGRATION_UNAVAILABLE', 'Recording playback is unavailable.');

    let response: Response;
    try {
      response = await fetch(`https://api.bolna.ai/recordings/call/${executionId}`, {
        headers: { Authorization: `Bearer ${this.config.BOLNA_API_KEY}` },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new HttpError(502, 'UPSTREAM_ERROR', 'The call recording could not be reached.');
    }
    if (response.status === 404 || response.status === 410)
      throw new HttpError(404, 'NOT_FOUND', 'No recording is available for this call.');
    if (!response.ok)
      throw new HttpError(502, 'UPSTREAM_ERROR', 'The call recording could not be loaded.');
    const contentType = response.headers.get('content-type') ?? '';
    if (
      !/^audio\/[\w.+-]+(?:\s*;.*)?$/i.test(contentType) &&
      !/^application\/octet-stream(?:\s*;.*)?$/i.test(contentType)
    )
      throw new HttpError(502, 'UPSTREAM_ERROR', 'Bolna did not return an audio recording.');
    if (!response.body)
      throw new HttpError(502, 'UPSTREAM_ERROR', 'Bolna returned an empty recording.');
    return {
      body: response.body,
      contentType,
      contentLength: response.headers.get('content-length'),
    };
  }

  async dashboard() {
    const [
      calls,
      inquiries,
      events,
      tools,
      evidence,
      knowledge,
      tickets,
      emails,
      meetings,
      chunkRows,
    ] = await Promise.all([
      this.database.request(
        'calls?select=id,code,status,record_source,started_at,summary,provider_execution_id,channel,direction,call_evidence(conversation_duration)&order=started_at.desc&limit=30',
      ),
      this.database.request(
        'inquiries?select=id,code,title,requirements,stage,created_at,import_batch,intake_details,source_call_id&order=created_at.desc&limit=30',
      ),
      this.database.request(
        'activity_events?select=id,event_type,description,occurred_at,call_id&order=occurred_at.desc&limit=40',
      ),
      this.database.request(
        'tool_executions?select=id,tool_name,status,error_code,created_at,source_ids,inquiry_id,ticket_id&order=created_at.desc&limit=40',
      ),
      this.database.request(
        'call_evidence?select=execution_id,provider_status,summary,contact_observations,conversation_duration,updated_at&order=updated_at.desc&limit=30',
      ),
      this.database.request(
        'knowledge_documents?select=id,document_key,version,approval_status,title,source_path,visibility,approved_at&order=document_key',
      ),
      this.database.request('support_ticket_dashboard?select=*&order=reported_at.desc&limit=40'),
      this.database.request(
        'integration_jobs?select=id,status,attempts,last_error_code,provider_message_id,created_at,payload&job_type=eq.send_email&dedupe_key=like.support:*&order=created_at.desc&limit=80',
      ),
      this.database.request(
        `meetings?select=id,code,title,requested_start_at,duration_minutes,timezone,status,provider,provider_event_id,inquiry_id,project_id,confirmation_expires_at,confirmation_sent_at,confirmed_at,calendar_sync_status,calendar_sync_attempts,calendar_sync_error_code,calendar_event_url,meet_url,calendar_synced_at,calendar_confirmation_sent_at,employees(full_name)&status=in.(requested,pending_confirmation,confirmed)&requested_start_at=gte.${encodeURIComponent(new Date().toISOString())}&order=requested_start_at&limit=30`,
      ),
      this.database.request('knowledge_chunks?select=document_id&limit=1000'),
    ]);
    const callRows = z
      .array(
        z
          .object({
            call_evidence: z
              .object({ conversation_duration: z.number().nonnegative() })
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .parse(calls);
    const meetingRows = z
      .array(
        z
          .object({
            status: z.string(),
            confirmation_expires_at: z.string().nullable(),
          })
          .passthrough(),
      )
      .parse(meetings);
    const checkedAt = Date.now();
    const chunks = z.array(z.object({ document_id: z.uuid() })).parse(chunkRows);
    const documents = z.array(z.object({ id: z.uuid().optional() }).passthrough()).parse(knowledge);
    const snapshot = dashboardSchema.parse({
      calls: callRows.map(({ call_evidence, ...call }) => ({
        ...call,
        duration_seconds: call_evidence?.conversation_duration ?? null,
      })),
      inquiries,
      events,
      tools,
      evidence,
      knowledge: documents.map((doc) => ({
        ...doc,
        indexed_passages: chunks.filter((chunk) => chunk.document_id === doc.id).length,
      })),
      meetings: meetingRows.map((meeting) => ({
        ...meeting,
        confirmation_expired:
          meeting.status === 'pending_confirmation' &&
          meeting.confirmation_expires_at !== null &&
          Date.parse(meeting.confirmation_expires_at) <= checkedAt,
      })),
      support: supportDashboardSchema.parse({ tickets, emails }),
    });
    const sourceIds = [...new Set(snapshot.tools.flatMap((tool) => tool.source_ids))].slice(0, 160);
    if (sourceIds.length) {
      const sources = z
        .array(
          z.object({
            id: z.uuid(),
            document_id: z.uuid(),
            chunk_index: z.number().int(),
            knowledge_documents: z.object({
              document_key: z.string(),
              version: z.string(),
              title: z.string(),
            }),
          }),
        )
        .parse(
          await this.database.request(
            `knowledge_chunks?select=id,document_id,chunk_index,knowledge_documents(document_key,version,title)&id=in.(${sourceIds.join(',')})&limit=160`,
          ),
        );
      snapshot.sources = sources.map(({ knowledge_documents: document, ...chunk }) => ({
        ...chunk,
        ...document,
      }));
    }
    return snapshot;
  }
}
