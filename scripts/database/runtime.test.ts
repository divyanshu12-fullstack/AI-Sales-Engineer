import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildImportSql, readPack, workspaceRoot } from './pack.js';

describe('knowledge and voice runtime SQL', () => {
  let db: PGlite;
  let documentId: string;
  const vectorText = JSON.stringify([1, ...Array<number>(4095).fill(0)]);
  beforeAll(async () => {
    db = new PGlite({ extensions: { vector } });
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create schema extensions; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant usage on schema extensions to service_role;
    `);
    for (const file of [
      '20261023062407_business_foundation.sql',
      '20261023062414_initial_import.sql',
    ])
      await db.exec(await readFile(resolve(workspaceRoot, 'supabase/migrations', file), 'utf8'));
    const pack = await readPack();
    await db.query(buildImportSql(pack.data));
    for (const file of [
      '20261023205229_approved_knowledge.sql',
      '20261023205234_voice_operations.sql',
      '20261023210244_intake_provenance.sql',
    ])
      await db.exec(await readFile(resolve(workspaceRoot, 'supabase/migrations', file), 'utf8'));
    documentId = pack.data.tables.knowledge_documents?.[0]?.id ?? '';
  });
  afterAll(async () => {
    await db?.close();
  });

  it('applies migrations without inventing Auth users or changing imported business records', async () => {
    const result = await db.query(`select (select count(*)::int from auth.users) users,
      (select count(*)::int from public.calls) calls,(select count(*)::int from public.inquiries) inquiries`);
    expect(result.rows[0]).toEqual({ users: 0, calls: 10, inquiries: 4 });
  });
  it('rejects indexing draft snapshots', async () => {
    await expect(
      db.query(
        `insert into public.knowledge_chunks(document_id,document_sha256,chunk_index,content,content_sha256,embedding_model,chunker_version,embedding)
      select id,content_sha256,0,'Test',encode(sha256(convert_to('Test','UTF8')),'hex'),'qwen/qwen3-embedding-8b','markdown-sections-v1',$1::extensions.vector from public.knowledge_documents where id=$2`,
        [vectorText, documentId],
      ),
    ).rejects.toThrow('Only approved public');
  });
  it('records an exact-snapshot owner authorization without fake administrator identities', async () => {
    await db.query(
      `insert into asterbyte_private.owner_knowledge_approvals(document_id,content_sha256,authorization_reference)
      select id,content_sha256,'Explicit project-owner approval in test fixture only.' from public.knowledge_documents where id=$1`,
      [documentId],
    );
    await db.query(
      `update public.knowledge_documents d set approval_status='approved',approved_at=now(),owner_approval_id=a.id
      from asterbyte_private.owner_knowledge_approvals a where a.document_id=d.id and d.id=$1`,
      [documentId],
    );
    expect((await db.query('select * from public.admin_profiles')).rows).toHaveLength(0);
  });
  it('prevents altering the approved content or scope', async () => {
    await expect(
      db.query("update public.knowledge_documents set visibility='internal' where id=$1", [
        documentId,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('stores full vectors and restricts public retrieval to currently approved documents', async () => {
    await db.query(
      `insert into public.knowledge_chunks(document_id,document_sha256,chunk_index,content,content_sha256,embedding_model,chunker_version,embedding)
      select id,content_sha256,0,'Test',encode(sha256(convert_to('Test','UTF8')),'hex'),'qwen/qwen3-embedding-8b','markdown-sections-v1',$1::extensions.vector from public.knowledge_documents where id=$2`,
      [vectorText, documentId],
    );
    await db.exec('set role service_role');
    try {
      expect(
        (
          await db.query('select * from public.search_company_knowledge($1::extensions.vector)', [
            vectorText,
          ])
        ).rows,
      ).toHaveLength(1);
    } finally {
      await db.exec('reset role');
    }
    await db.query("update public.knowledge_documents set approval_status='retired' where id=$1", [
      documentId,
    ]);
    expect(
      (
        await db.query('select * from public.search_company_knowledge($1::extensions.vector)', [
          vectorText,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it('rejects a wrong vector dimension', async () => {
    expect(
      (
        await db.query('select * from public.search_company_knowledge($1::extensions.vector)', [
          '[1,0]',
        ])
      ).rows,
    ).toHaveLength(0);
  });

  const details = {
    confirmed: 'yes',
    customer_name: 'Test Person',
    email: 'test@example.invalid',
    phone: '',
    organization: '',
    title: 'Scheduling system',
    requirements: 'Need a scheduling system for a small company.',
    budget: 'Not supplied',
    timeline: 'Not supplied',
  };
  it('creates one unverified, unassigned opportunity and event transactionally; duplicate retry does not merge contacts', async () => {
    const before = await db.query<{ count: number }>(
      'select count(*)::int count from public.contacts',
    );
    await db.exec('set role service_role');
    try {
      const first = await db.query<{ result: { duplicate: boolean; inquiry_id: string } }>(
        "select public.record_project_inquiry('agent:test-one',$1,$2::jsonb) result",
        ['a'.repeat(64), JSON.stringify(details)],
      );
      const retry = await db.query<{ result: { duplicate: boolean; inquiry_id: string } }>(
        "select public.record_project_inquiry('agent:test-one',$1,$2::jsonb) result",
        ['a'.repeat(64), JSON.stringify(details)],
      );
      expect(first.rows[0]?.result.duplicate).toBe(false);
      expect(retry.rows[0]?.result).toMatchObject({
        duplicate: true,
        inquiry_id: first.rows[0]?.result.inquiry_id,
      });
      await expect(
        db.query("select public.record_project_inquiry('agent:test-one',$1,$2::jsonb)", [
          'b'.repeat(64),
          JSON.stringify(details),
        ]),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await db.exec('reset role');
    }
    expect(
      (await db.query<{ count: number }>('select count(*)::int count from public.contacts')).rows[0]
        ?.count,
    ).toBe((before.rows[0]?.count ?? 0) + 1);
    expect(
      (
        await db.query(
          'select * from public.inquiries where import_batch is null and primary_service_id is null and owner_employee_id is null',
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.contacts where contact_source='voice_agent' and preferred_language is null",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('rejects missing confirmation and rolls back all intake writes', async () => {
    await expect(
      db.query("select public.record_project_inquiry('agent:test-two',$1,$2::jsonb)", [
        'a'.repeat(64),
        JSON.stringify({ ...details, confirmed: 'no' }),
      ]),
    ).rejects.toThrow('unconfirmed');
  });

  const evidence = {
    execution_id: '00000000-0000-4000-8000-000000000901',
    agent_id: '00000000-0000-4000-8000-000000000902',
    provider_status: 'completed',
    status_rank: 7,
    provider_updated_at: '2026-10-24T10:01:00Z',
    payload_sha256: 'c'.repeat(64),
    conversation_duration: 60,
    transcript: 'user: Hello',
    summary: 'Test conversation',
    extracted_data: {},
    contact_observations: { name: 'Test Person' },
    channel: 'browser',
    direction: 'inbound',
    call_status: 'completed',
    started_at: '2026-10-24T10:00:00Z',
    ended_at: '2026-10-24T10:01:00Z',
  };
  it('handles duplicate and out-of-order execution updates without duplicate calls/events or automatic leads', async () => {
    const invoke = async (value: unknown) =>
      db.query<{ result: { changed: boolean } }>(
        'select public.ingest_bolna_execution($1::jsonb) result',
        [JSON.stringify(value)],
      );
    expect((await invoke(evidence)).rows[0]?.result.changed).toBe(true);
    expect((await invoke(evidence)).rows[0]?.result.changed).toBe(false);
    expect(
      (
        await invoke({
          ...evidence,
          provider_status: 'in-progress',
          status_rank: 4,
          payload_sha256: 'd'.repeat(64),
        })
      ).rows[0]?.result.changed,
    ).toBe(false);
    expect(
      (
        await db.query('select * from public.calls where provider_execution_id=$1', [
          evidence.execution_id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect((await db.query('select * from public.call_evidence')).rows).toHaveLength(1);
    expect(
      (await db.query('select * from public.inquiries where import_batch is null')).rows,
    ).toHaveLength(1);
  });
  for (const role of ['anon', 'authenticated']) {
    it(`denies ${role} RPC execution and private table data`, async () => {
      await db.exec(`set role ${role}`);
      try {
        for (const rpc of [
          "record_project_inquiry('agent:test',repeat('a',64),'{}')",
          "ingest_bolna_execution('{}')",
        ])
          await expect(db.query(`select public.${rpc}`)).rejects.toMatchObject({ code: '42501' });
        if (role === 'anon')
          await expect(db.query('select * from public.call_evidence')).rejects.toMatchObject({
            code: '42501',
          });
        else expect((await db.query('select * from public.call_evidence')).rows).toHaveLength(0);
      } finally {
        await db.exec('reset role');
      }
    });
  }
  it('permits dashboard table reads only for an explicitly active administrator and denies owner-approval access', async () => {
    await db.exec('begin');
    try {
      await db.exec(`insert into auth.users(id) values('00000000-0000-4000-8000-000000000999');
        insert into public.admin_profiles(id,display_name,role,is_active) values('00000000-0000-4000-8000-000000000999','Local test admin','admin',true);
        set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000999'; set local role authenticated;`);
      expect((await db.query('select * from public.call_evidence')).rows).toHaveLength(1);
      await db.exec('savepoint private_test');
      await expect(
        db.query('select * from asterbyte_private.owner_knowledge_approvals'),
      ).rejects.toMatchObject({ code: '42501' });
      await db.exec('rollback to savepoint private_test');
    } finally {
      await db.exec('rollback');
    }
  });
});
