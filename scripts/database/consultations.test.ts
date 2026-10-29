import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildImportSql, workspaceRoot } from './pack.js';
import { readTestPack } from './test-pack.js';

const sha = (value: string) => value.repeat(64 / value.length);

describe('consultation scheduling and email confirmation boundaries', () => {
  let db: PGlite;
  let inquiry: string;
  let phoneOnlyInquiry: string;
  let consultant: string;
  let meeting: string;
  let startAt: string;
  let laterAt: string;
  const details = {
    confirmed: 'yes',
    title: 'Clinic appointment booking portal',
    customer_name: 'Consultation Test Caller',
    email: 'caller@resend.dev',
    phone: '',
    organization: 'Test Clinic',
    requirements: 'We need an appointment booking portal with reminders for our clinic.',
    budget: '',
    timeline: '',
  };
  const noEmailDetails = { ...details, email: '', phone: '+919876543210' };

  const schedule = async ({
    key,
    reference,
    at,
    email,
    who,
    hash = sha('a'),
  }: {
    key: string;
    reference: string;
    at: string;
    email: string;
    who: string;
    hash?: string;
  }) =>
    db.query<{ r: Record<string, unknown> }>(
      'select public.record_consultation($1,$2,$3,$4,$5,$6,$7::jsonb) r',
      [key, hash, reference, who, at, email, JSON.stringify({ confirmed: 'yes' })],
    );

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
      '20261028132018_consultation_scheduling.sql',
      '20261028132636_consultation_reservation_expiry.sql',
    ])
      await db.exec(await readFile(resolve(workspaceRoot, 'supabase/migrations', name), 'utf8'));

    await db.exec('set role service_role');
    try {
      const created = await db.query<{ r: { reference: string } }>(
        'select public.record_project_inquiry($1,$2,$3::jsonb) r',
        ['test:consultation-inquiry', sha('b'), JSON.stringify(details)],
      );
      inquiry = created.rows[0]?.r.reference ?? '';
      const phoneOnly = await db.query<{ r: { reference: string } }>(
        'select public.record_project_inquiry($1,$2,$3::jsonb) r',
        ['test:consultation-phone', sha('c'), JSON.stringify(noEmailDetails)],
      );
      phoneOnlyInquiry = phoneOnly.rows[0]?.r.reference ?? '';
    } finally {
      await db.exec('reset role');
    }

    const employees = await db.query<{ id: string }>(
      'select id from public.employees where is_active order by code limit 2',
    );
    consultant = employees.rows[0]?.id ?? '';
    const day = new Date(Date.now() + 2 * 86_400_000);
    while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
    const at = (hours: number, minutes: number) =>
      new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes),
      ).toISOString();
    startAt = at(5, 30);
    laterAt = at(7, 30);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('reserves a real slot with only an internal confirmation state and one email job', async () => {
    await db.exec('set role service_role');
    try {
      const r = await schedule({
        key: 'agent:meeting-one',
        reference: inquiry,
        at: startAt,
        email: '',
        who: consultant,
      });
      const result = r.rows[0]?.r as {
        status: string;
        meeting_id: string;
        duplicate: boolean;
        consultant_name: string;
      };
      meeting = result.meeting_id;
      expect(result).toMatchObject({ status: 'scheduled', duplicate: false });
      expect(result.consultant_name.length).toBeGreaterThan(2);
    } finally {
      await db.exec('reset role');
    }
    expect(
      (
        await db.query(
          'select status,provider,provider_event_id from public.meetings where id=$1',
          [meeting],
        )
      ).rows,
    ).toEqual([{ status: 'pending_confirmation', provider: null, provider_event_id: null }]);
    expect(
      (
        await db.query(
          "select payload->>'template' template,status from public.integration_jobs where payload->>'meeting_id'=$1",
          [meeting],
        )
      ).rows,
    ).toEqual([{ template: 'meeting_confirmation', status: 'pending' }]);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.activity_events where event_type='meeting_requested' and event_payload->>'meeting_id'=$1",
          [meeting],
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });

  it('deduplicates a retried tool call and rejects a reused key with different details', async () => {
    await db.exec('set role service_role');
    try {
      const again = await schedule({
        key: 'agent:meeting-one',
        reference: inquiry,
        at: startAt,
        email: '',
        who: consultant,
      });
      expect(again.rows[0]?.r).toMatchObject({
        status: 'scheduled',
        meeting_id: meeting,
        duplicate: true,
      });
      await expect(
        schedule({
          key: 'agent:meeting-one',
          reference: inquiry,
          at: laterAt,
          email: '',
          who: consultant,
          hash: sha('f'),
        }),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await db.exec('reset role');
    }
    expect((await db.query('select count(*)::int n from public.meeting_submissions')).rows).toEqual(
      [{ n: 1 }],
    );
    expect(
      (
        await db.query(
          "select count(*)::int n from public.integration_jobs where payload->>'template'='meeting_confirmation'",
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });

  it('asks for an email before booking when the inquiry has only a phone number', async () => {
    await db.exec('set role service_role');
    try {
      const r = await schedule({
        key: 'agent:meeting-phone',
        reference: phoneOnlyInquiry,
        at: startAt,
        email: '',
        who: consultant,
      });
      expect(r.rows[0]?.r).toEqual({
        status: 'email_required',
        inquiry_reference: phoneOnlyInquiry,
      });
    } finally {
      await db.exec('reset role');
    }
    expect(
      (
        await db.query(
          'select count(*)::int n from public.meetings where inquiry_id=(select id from public.inquiries where code=$1)',
          [phoneOnlyInquiry],
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
  });

  it('rejects Sunday, outside-hours, near-term and conflicting requests', async () => {
    const sunday = new Date(startAt);
    sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7 || 7));
    sunday.setUTCHours(5, 30, 0, 0);
    await expect(
      schedule({
        key: 'agent:meeting-sunday',
        reference: inquiry,
        at: sunday.toISOString(),
        email: '',
        who: consultant,
      }),
    ).rejects.toThrow('outside consultation hours');
    const outside = new Date(startAt);
    outside.setUTCHours(3, 30, 0, 0);
    await expect(
      schedule({
        key: 'agent:meeting-outside',
        reference: inquiry,
        at: outside.toISOString(),
        email: '',
        who: consultant,
      }),
    ).rejects.toThrow('outside consultation hours');
    const soon = new Date(Date.now() + 2 * 3_600_000);
    await expect(
      schedule({
        key: 'agent:meeting-soon',
        reference: inquiry,
        at: soon.toISOString(),
        email: '',
        who: consultant,
      }),
    ).rejects.toThrow('outside consultation hours');
    await expect(
      schedule({
        key: 'agent:meeting-conflict',
        reference: inquiry,
        at: startAt,
        email: '',
        who: consultant,
      }),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('confirms from the emailed capability once and keeps the dashboard confirmed on retries', async () => {
    const tokenHash = sha('d');
    await db.query(
      "update public.meetings set confirmation_token_sha256=$1,confirmation_expires_at=now()+interval '7 days' where id=$2",
      [tokenHash, meeting],
    );
    await db.exec('set role service_role');
    try {
      const pending = await db.query<{ r: Record<string, unknown> }>(
        'select public.get_meeting_confirmation($1) r',
        [tokenHash],
      );
      const pendingResult = pending.rows[0]?.r;
      expect(pendingResult?.status).toBe('pending');
      expect(typeof pendingResult?.reference).toBe('string');
      const first = await db.query<{ r: Record<string, unknown> }>(
        'select public.confirm_meeting($1) r',
        [tokenHash],
      );
      expect(first.rows[0]?.r).toMatchObject({ status: 'confirmed', already_confirmed: false });
      const again = await db.query<{ r: Record<string, unknown> }>(
        'select public.confirm_meeting($1) r',
        [tokenHash],
      );
      expect(again.rows[0]?.r).toMatchObject({ status: 'confirmed', already_confirmed: true });
    } finally {
      await db.exec('reset role');
    }
    const confirmedRow = (
      await db.query<{
        status: string;
        provider: string;
        provider_event_id: string;
        confirmed_at: string;
      }>('select status,provider,provider_event_id,confirmed_at from public.meetings where id=$1', [
        meeting,
      ])
    ).rows[0];
    expect(confirmedRow).toMatchObject({
      status: 'confirmed',
      provider: 'customer_confirmation',
      provider_event_id: meeting,
    });
    expect(confirmedRow?.confirmed_at).toBeTruthy();
    expect(
      (
        await db.query(
          "select count(*)::int n from public.activity_events where event_type='meeting_confirmed' and event_payload->>'meeting_id'=$1",
          [meeting],
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });

  it('does not confirm an expired reservation and never exposes contact details', async () => {
    await db.exec('set role service_role');
    try {
      const r = await schedule({
        key: 'agent:meeting-expiry',
        reference: inquiry,
        at: laterAt,
        email: '',
        who: consultant,
      });
      const expiredMeeting = (r.rows[0]?.r as { meeting_id: string }).meeting_id;
      const tokenHash = sha('e');
      await db.query(
        "update public.meetings set confirmation_token_sha256=$1,confirmation_expires_at=now()-interval '1 second' where id=$2",
        [tokenHash, expiredMeeting],
      );
      const expired = await db.query<{ r: Record<string, unknown> }>(
        'select public.get_meeting_confirmation($1) r',
        [tokenHash],
      );
      expect(expired.rows[0]?.r).toMatchObject({ status: 'expired' });
      const outcome = await db.query<{ r: Record<string, unknown> }>(
        'select public.confirm_meeting($1) r',
        [tokenHash],
      );
      expect(outcome.rows[0]?.r).toMatchObject({ status: 'expired' });
      expect(JSON.stringify(expired.rows[0]?.r)).not.toContain('caller@');
      const released = await schedule({
        key: 'agent:meeting-after-expiry',
        reference: inquiry,
        at: laterAt,
        email: '',
        who: consultant,
      });
      expect(released.rows[0]?.r).toMatchObject({ status: 'scheduled', duplicate: false });
      expect(
        (await db.query('select status from public.meetings where id=$1', [expiredMeeting])).rows,
      ).toEqual([{ status: 'pending_confirmation' }]);
    } finally {
      await db.exec('reset role');
    }
  });

  it('leases only consultation emails and denies anonymous execution', async () => {
    const job = await db.query<{ id: string }>('select * from public.claim_meeting_email()');
    expect(job.rows).toHaveLength(1);
    expect(
      (await db.query('select * from public.claim_meeting_email($1)', [job.rows[0]?.id])).rows,
    ).toHaveLength(0);
    await db.exec('set role anon');
    try {
      await expect(
        db.query('select public.get_meeting_confirmation($1)', [sha('d')]),
      ).rejects.toThrow('permission denied');
    } finally {
      await db.exec('reset role');
    }
  });
});
