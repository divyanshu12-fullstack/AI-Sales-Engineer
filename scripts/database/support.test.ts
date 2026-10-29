import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { buildImportSql, workspaceRoot } from './pack.js';
import { readTestPack } from './test-pack.js';

describe('demo support transactional boundaries', () => {
  let db: PGlite;
  const hash = 'a'.repeat(64);
  let ticket: string;
  const details = {
    confirmed: 'yes',
    title: 'Appointments not visible',
    description: 'The appointment screen is empty since this morning.',
    priority: 'P3',
    issue_kind: 'suspected_bug',
  };
  beforeAll(async () => {
    db = new PGlite({ extensions: { vector } });
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;create schema extensions;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant usage on schema extensions to service_role;`);
    for (const name of [
      '20261023062407_business_foundation.sql',
      '20261023062414_initial_import.sql',
    ])
      await db.exec(await readFile(resolve(workspaceRoot, 'supabase/migrations', name), 'utf8'));
    await db.exec(buildImportSql(readTestPack()));
    for (const name of [
      '20261023205229_approved_knowledge.sql',
      '20261023205234_voice_operations.sql',
      '20261023210244_intake_provenance.sql',
      '20261025150940_support_workflow.sql',
    ])
      await db.exec(await readFile(resolve(workspaceRoot, 'supabase/migrations', name), 'utf8'));
  });
  afterAll(async () => {
    await db?.close();
  });
  it('keeps all original projects and adds four-digit aliases without enabling fictional email recipients', async () => {
    expect((await db.query('select count(*)::int n from public.projects')).rows).toEqual([
      { n: 6 },
    ]);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.projects where support_code ~ '^[0-9]{4}$'",
        )
      ).rows,
    ).toEqual([{ n: 6 }]);
    expect(
      (await db.query('select count(*)::int n from public.contacts where support_email_enabled'))
        .rows,
    ).toEqual([{ n: 0 }]);
  });
  it('does not reveal whether a project exists without a matching customer code', async () => {
    const missing = await db.query<{ r: unknown }>(
      'select public.lookup_demo_support($1,$2,$3,$4) r',
      ['9999', '', '', hash],
    );
    const known = await db.query<{ r: unknown }>(
      'select public.lookup_demo_support($1,$2,$3,$4) r',
      ['2001', '1002', '', hash],
    );
    expect(missing.rows[0]?.r).toEqual({ status: 'customer_code_required' });
    expect(known.rows[0]?.r).toEqual(missing.rows[0]?.r);
  });
  it('allows only minimal demo intake, never presents a code match as verified identity', async () => {
    const r = await db.query<{ r: Record<string, unknown> }>(
      'select public.lookup_demo_support($1,$2,$3,$4) r',
      ['2001', '1001', '', hash],
    );
    expect(r.rows[0]?.r).toMatchObject({
      status: 'matched',
      identity_status: 'demo_code_match',
      scope: 'demo_support_intake_only',
    });
    expect(r.rows[0]?.r).not.toHaveProperty('email');
  });
  it('creates one ticket, one acknowledgement job and one event on duplicate retries', async () => {
    await db.exec('set role service_role');
    try {
      const a = await db.query<{ r: { ticket_id: string; duplicate: boolean } }>(
        'select public.record_support_ticket($1,$2,$3,$4::jsonb) r',
        ['agent:support-one', 'b'.repeat(64), hash, JSON.stringify(details)],
      );
      ticket = a.rows[0]?.r.ticket_id ?? '';
      const b = await db.query<{ r: { ticket_id: string; duplicate: boolean } }>(
        'select public.record_support_ticket($1,$2,$3,$4::jsonb) r',
        ['agent:support-one', 'b'.repeat(64), hash, JSON.stringify(details)],
      );
      expect(a.rows[0]?.r.duplicate).toBe(false);
      expect(b.rows[0]?.r).toMatchObject({ ticket_id: ticket, duplicate: true });
    } finally {
      await db.exec('reset role');
    }
    expect((await db.query('select count(*)::int n from public.integration_jobs')).rows).toEqual([
      { n: 1 },
    ]);
    await expect(
      db.query('select public.record_support_ticket($1,$2,$3,$4::jsonb)', [
        'agent:support-one',
        'c'.repeat(64),
        hash,
        JSON.stringify(details),
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('rejects a missing/expired grant and refuses unconfirmed writes', async () => {
    await expect(
      db.query('select public.record_support_ticket($1,$2,$3,$4::jsonb)', [
        'agent:support-two',
        'b'.repeat(64),
        'f'.repeat(64),
        JSON.stringify(details),
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.query('select public.record_support_ticket($1,$2,$3,$4::jsonb)', [
        'agent:support-two',
        'b'.repeat(64),
        hash,
        JSON.stringify({ ...details, confirmed: 'no' }),
      ]),
    ).rejects.toThrow('unconfirmed');
    await db.exec("update public.support_access_grants set expires_at=now()-interval '1 second'");
    await expect(
      db.query('select public.record_support_ticket($1,$2,$3,$4::jsonb)', [
        'agent:support-two',
        'b'.repeat(64),
        hash,
        JSON.stringify(details),
      ]),
    ).rejects.toThrow('expired');
  });
  it('requires active admin resolution evidence and queues exactly one resolution notice', async () => {
    const admin = '00000000-0000-4000-8000-000000000123';
    await expect(
      db.query('select public.update_support_ticket($1,$2,$3,$4)', [
        ticket,
        admin,
        'resolved',
        'Fixed the appointment filter.',
      ]),
    ).rejects.toThrow('administrator');
    await db.query('insert into auth.users values($1)', [admin]);
    await db.query(
      "insert into public.admin_profiles(id,display_name,is_active,role) values($1,'Test administrator',true,'admin')",
      [admin],
    );
    await expect(
      db.query('select public.update_support_ticket($1,$2,$3,$4)', [ticket, admin, 'resolved', '']),
    ).rejects.toThrow('resolution');
    await db.query('select public.update_support_ticket($1,$2,$3,$4)', [
      ticket,
      admin,
      'resolved',
      'Fixed the appointment filter.',
    ]);
    await db.query('select public.update_support_ticket($1,$2,$3,$4)', [
      ticket,
      admin,
      'resolved',
      'Fixed the appointment filter.',
    ]);
    expect((await db.query('select count(*)::int n from public.integration_jobs')).rows).toEqual([
      { n: 2 },
    ]);
  });
  it('leases jobs and prevents another worker from claiming the same delivery', async () => {
    const first = await db.query<{ id: string }>('select * from public.claim_support_email()');
    const again = await db.query('select * from public.claim_support_email($1)', [
      first.rows[0]?.id,
    ]);
    expect(first.rows).toHaveLength(1);
    expect(again.rows).toHaveLength(0);
  });
  it('denies anonymous tools, grant-table access and dashboard view reads', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from public.support_access_grants')).rejects.toThrow(
        'permission denied',
      );
      await expect(db.query('select * from public.support_ticket_dashboard')).rejects.toThrow(
        'permission denied',
      );
      await expect(
        db.query('select public.lookup_demo_support($1,$2,$3,$4)', ['2001', '1001', '', hash]),
      ).rejects.toThrow('permission denied');
    } finally {
      await db.exec('reset role');
    }
  });
  it('validates the owner-run demo customer SQL without creating Auth or administrator accounts', async () => {
    const example = await readFile(
      resolve(workspaceRoot, 'supabase/examples/create_demo_support_customer.sql'),
      'utf8',
    );
    await db.exec(example.replace('REPLACE_WITH_YOUR_REAL_EMAIL', 'delivered@resend.dev'));
    expect(
      (
        await db.query(
          "select support_code,support_demo_enabled from public.projects where support_code='9002'",
        )
      ).rows,
    ).toEqual([{ support_code: '9002', support_demo_enabled: true }]);
    expect((await db.query('select count(*)::int n from public.admin_profiles')).rows).toEqual([
      { n: 1 },
    ]);
  });
});
