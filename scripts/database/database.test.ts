import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildImportSql,
  expectedCounts,
  implementedTables,
  readPack,
  rows,
  validatePack,
  workspaceRoot,
} from './pack.js';
import type { Pack, Row } from './pack.js';

const reportSchema = z.object({
  import_report: z.object({
    total_records: z.literal(113),
    new_integration_jobs: z.literal(0),
    tables: z.array(
      z.object({
        table: z.string(),
        inserted: z.number(),
        identical_skipped: z.number(),
        batch_total: z.number(),
      }),
    ),
  }),
});
const first = <T>(items: T[]): T => {
  const item = items[0];
  if (!item) throw new Error('Expected a test record.');
  return item;
};

describe('reviewed PostgreSQL migrations and initial import (PGlite)', () => {
  let db: PGlite;
  let pack: Pack;
  let initialReport: z.infer<typeof reportSchema>['import_report'];

  beforeAll(async () => {
    pack = await readPack();
    db = new PGlite();
    // Isolated engine-only Auth contract. NO Auth users or credentials are generated, even here.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      begin;
    `);
    const folder = resolve(workspaceRoot, 'supabase/migrations');
    for (const name of (await readdir(folder)).filter((file) => file.endsWith('.sql')).sort()) {
      await db.exec(await readFile(resolve(folder, name), 'utf8'));
    }
    await db.exec('commit');
    const result = await db.query(buildImportSql(pack.data));
    initialReport = reportSchema.parse(first(result.rows)).import_report;
  });

  afterAll(async () => {
    await db?.close();
  });

  const rollback = async (operation: () => Promise<void>): Promise<void> => {
    await db.exec('begin');
    try {
      await operation();
    } finally {
      await db.exec('rollback');
    }
  };

  const insert = async (table: string, record: Row): Promise<void> => {
    if (!implementedTables.includes(table)) throw new Error('Unknown test table.');
    await db.query(
      `insert into public.${table} select * from jsonb_populate_record(null::public.${table}, $1::jsonb)`,
      [JSON.stringify(record)],
    );
  };

  it('applies both migrations and imports exactly 113 rows across 17 populated tables', () => {
    expect(initialReport.total_records).toBe(113);
    expect(initialReport.tables.filter(({ inserted }) => inserted > 0)).toHaveLength(17);
    expect(initialReport.tables.reduce((count, { inserted }) => count + inserted, 0)).toBe(113);
    for (const [table, count] of Object.entries(expectedCounts)) {
      if (table === 'knowledge_chunks') continue;
      expect(initialReport.tables.find((entry) => entry.table === table)?.batch_total).toBe(count);
    }
  });

  it('reruns atomically with zero inserts and 113 fully equivalent skips', async () => {
    const result = reportSchema.parse(first((await db.query(buildImportSql(pack.data))).rows));
    expect(result.import_report.tables.reduce((sum, row) => sum + row.inserted, 0)).toBe(0);
    expect(result.import_report.tables.reduce((sum, row) => sum + row.identical_skipped, 0)).toBe(
      113,
    );
  });

  it('detects a different UUID colliding with a business code', async () => {
    const changed = structuredClone(pack.data);
    first(rows(changed, 'services')).id = '00000000-0000-4000-8000-000000000123';
    await expect(db.query(buildImportSql(changed))).rejects.toThrow(
      'Import conflict: table=services',
    );
  });

  it('reports differing fields instead of overwriting, including timestamps', async () => {
    const changed = structuredClone(pack.data);
    first(rows(changed, 'services')).updated_at = '2026-10-23T04:00:00Z';
    await expect(db.query(buildImportSql(changed))).rejects.toThrow(
      'differing_fields={updated_at}',
    );
  });

  it('rolls back earlier inserts when a later collision fails', async () => {
    await rollback(async () => {
      const unusedService = first(rows(pack.data, 'services'));
      // Local fixture only, rolled back: make the first table insert real before a late conflict.
      await db.query('delete from public.services where id = $1', [unusedService.id]);
      await db.exec('savepoint attempted_import');
      const changed = structuredClone(pack.data);
      first(rows(changed, 'activity_events')).description = 'Conflicting test text.';
      await expect(db.query(buildImportSql(changed))).rejects.toThrow(
        'Import conflict: table=activity_events',
      );
      await db.exec('rollback to savepoint attempted_import');
      expect(
        first(
          (
            await db.query<{ count: number }>(
              'select count(*)::int count from public.services where id = $1',
              [unusedService.id],
            )
          ).rows,
        ).count,
      ).toBe(0);
    });
  });

  it('keeps admin mappings/jobs empty, leaves Auth empty, and creates no vector table or extension', async () => {
    const result = await db.query(`select
      (select count(*)::int from public.admin_profiles) admins,
      (select count(*)::int from public.integration_jobs) jobs,
      (select count(*)::int from auth.users) auth_users,
      to_regclass('public.knowledge_chunks') chunks,
      exists(select 1 from pg_extension where extname = 'vector') vector_installed`);
    expect(first(result.rows)).toEqual({
      admins: 0,
      jobs: 0,
      auth_users: 0,
      chunks: null,
      vector_installed: false,
    });
  });

  it('stores exact draft Markdown hashes and never fabricates provider outcomes', async () => {
    expect(
      first(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from public.knowledge_documents where approval_status = 'draft' and approved_by_admin_id is null and approved_at is null and content_sha256 = encode(sha256(convert_to(content_markdown, 'UTF8')), 'hex')`,
          )
        ).rows,
      ).count,
    ).toBe(7);
    expect(
      first(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from public.calls where record_source = 'imported_history' and identity_status = 'unverified' and provider is null and provider_execution_id is null`,
          )
        ).rows,
      ).count,
    ).toBe(10);
    expect(
      first(
        (
          await db.query<{ count: number }>(
            `select count(*)::int count from public.meetings where status = 'requested' and provider is null and provider_event_id is null`,
          )
        ).rows,
      ).count,
    ).toBe(3);
  });

  it('enables RLS on every implemented table', async () => {
    const result = await db.query<{ count: number }>(
      `select count(*)::int count from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`,
    );
    expect(first(result.rows).count).toBe(19);
  });

  it('indexes every foreign-key prefix and validates every constraint', async () => {
    const missing =
      await db.query(`select c.conname from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype = 'f' and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
          and c.conkey = array(select k from unnest(i.indkey) with ordinality columns(k, position)
            where position <= cardinality(c.conkey) order by position)
      )`);
    expect(missing.rows).toEqual([]);
  });

  for (const table of implementedTables) {
    it(`denies anonymous SELECT and all browser writes on ${table}`, async () => {
      try {
        await db.exec('set role anon');
        await expect(db.query(`select * from public.${table}`)).rejects.toMatchObject({
          code: '42501',
        });
        for (const statement of [
          `insert into public.${table} default values`,
          `update public.${table} set updated_at = updated_at`,
          `delete from public.${table}`,
        ])
          await expect(db.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await db.exec('reset role');
      }
    });
    it(`denies non-admin authenticated reads/writes on ${table}`, async () => {
      try {
        await db.exec(
          `set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000456'`,
        );
        expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
        for (const statement of [
          `insert into public.${table} default values`,
          `update public.${table} set updated_at = updated_at`,
          `delete from public.${table}`,
        ])
          await expect(db.query(statement)).rejects.toMatchObject({ code: '42501' });
      } finally {
        await db.exec('reset role; reset request.jwt.claim.sub');
      }
    });
  }

  it('does not expose developer import execution to browser or service roles', async () => {
    const result = await db.query(`select
      has_function_privilege('anon', 'asterbyte_private.import_initial_records(jsonb)', 'execute') anon,
      has_function_privilege('authenticated', 'asterbyte_private.import_initial_records(jsonb)', 'execute') authenticated,
      has_function_privilege('service_role', 'asterbyte_private.import_initial_records(jsonb)', 'execute') service`);
    expect(first(result.rows)).toEqual({ anon: false, authenticated: false, service: false });
  });

  it('rejects a project/contact grant with a different account', async () => {
    await rollback(async () => {
      const grant = structuredClone(first(rows(pack.data, 'project_contacts')));
      grant.id = '00000000-0000-4000-8000-000000000789';
      grant.customer_account_id = rows(pack.data, 'customer_accounts')[1]?.id;
      grant.contact_id = rows(pack.data, 'contacts').find(({ code }) => code === 'imran')?.id;
      await expect(insert('project_contacts', grant)).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects source calls owned by another contact/account', async () => {
    await rollback(async () => {
      const inquiry = structuredClone(first(rows(pack.data, 'inquiries')));
      inquiry.id = '00000000-0000-4000-8000-000000000790';
      inquiry.code = 'INQ-TEST';
      inquiry.source_call_id = first(rows(pack.data, 'calls')).id;
      await expect(insert('inquiries', inquiry)).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects a ticket from an account member without explicit project support access', async () => {
    await rollback(async () => {
      const ticket = structuredClone(rows(pack.data, 'support_tickets')[1]);
      if (!ticket) throw new Error('Missing ticket fixture.');
      ticket.id = '00000000-0000-4000-8000-000000000791';
      ticket.code = 'TKT-TEST';
      ticket.reporter_contact_id = rows(pack.data, 'contacts').find(
        ({ code }) => code === 'imran',
      )?.id;
      ticket.source_call_id = null;
      await expect(insert('support_tickets', ticket)).rejects.toThrow(
        'active project support permission',
      );
    });
  });

  it('does not let a second conversation turn a prospect into a customer', async () => {
    await rollback(async () => {
      await db.exec(
        "update public.customer_accounts set relationship_stage = 'customer' where code = 'northstar'",
      );
      await expect(db.exec('set constraints all immediate')).rejects.toThrow(
        'signed project history',
      );
    });
  });

  it('rejects public approval without a real active administrator record', async () => {
    await rollback(async () => {
      await expect(
        db.exec(
          "update public.knowledge_documents set approval_status = 'approved' where document_key = 'company-overview'",
        ),
      ).rejects.toThrow('explicitly active administrator');
    });
  });

  it('stops before inserting when an unreviewed trigger is present', async () => {
    await rollback(async () => {
      await db.exec(`create function public.unreviewed_test_trigger() returns trigger language plpgsql as $$begin return new; end;$$;
        create trigger unexpected_hook before insert on public.services for each row execute function public.unreviewed_test_trigger()`);
      await expect(db.query(buildImportSql(pack.data))).rejects.toThrow('Unreviewed trigger');
    });
  });

  it('rejects supplied-file drift rather than silently replacing a snapshot or hash', async () => {
    const changed = structuredClone(pack);
    first(rows(changed.data, 'knowledge_documents')).content_markdown = 'Changed without review.';
    await expect(validatePack(changed)).rejects.toThrow('Markdown snapshot mismatch');
  });

  it('rejects database schema drift before inserting', async () => {
    await rollback(async () => {
      await db.exec('alter table public.services add column unexpected_column text');
      await expect(db.query(buildImportSql(pack.data))).rejects.toThrow(
        'Schema column/type/nullability drift: services',
      );
    });
  });

  it('runs the portable metadata, validation and transaction-local access SQL', async () => {
    const folder = resolve(workspaceRoot, 'supabase/tests');
    await db.exec(await readFile(resolve(folder, 'preflight.sql'), 'utf8'));
    const verification = await db.query(
      await readFile(resolve(folder, 'verify_initial.sql'), 'utf8'),
    );
    expect(first(verification.rows)).toMatchObject({
      initial_database_verification: {
        total_records: 113,
        count_mismatches: 0,
        hash_mismatches: 0,
        rls_tables: 19,
        anonymous_grants: 0,
        browser_write_grants: 0,
        unsupported_customer_stages: 0,
        tickets_without_current_support_grant: 0,
        source_project_mismatches: 0,
        canonical_company_name: true,
      },
    });
    await db.exec(await readFile(resolve(folder, 'access_controls.sql'), 'utf8'));
  });
});
