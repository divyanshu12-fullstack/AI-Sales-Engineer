import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { loadEnvironment } from '../../apps/api/src/config/env.js';
import { Database } from '../../apps/api/src/lib/database.js';
import {
  chunkerVersion,
  chunkMarkdown,
  contentHash,
} from '../../apps/api/src/modules/knowledge/chunks.js';
import { embed, embeddingModel } from '../../apps/api/src/modules/knowledge/embeddings.js';
import { readPack, rows, workspaceRoot } from './pack.js';

const docSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  document_key: z.string(),
  version: z.string(),
  content_markdown: z.string(),
  content_sha256: z.string(),
  approval_status: z.string(),
  visibility: z.string(),
  source_path: z.string(),
});
const main = async () => {
  const config = loadEnvironment();
  const mcp = z
    .object({ mcp: z.object({ servers: z.object({ supabase: z.object({ url: z.url() }) }) }) })
    .parse(JSON.parse(await readFile(resolve(workspaceRoot, 'opencode.json'), 'utf8')));
  const project = new URL(mcp.mcp.servers.supabase.url).searchParams.get('project_ref');
  if (!config.SUPABASE_URL || new URL(config.SUPABASE_URL).hostname !== `${project}.supabase.co`)
    throw new Error('Target mismatch.');
  const pack = await readPack();
  const database = new Database(config);
  const documents = z
    .array(docSchema)
    .parse(
      await database.request(
        'knowledge_documents?select=id,title,document_key,version,content_markdown,content_sha256,approval_status,visibility,source_path&import_batch=eq.asterbyte-initial-v1',
      ),
    );
  if (documents.length !== 7) throw new Error('Expected seven reviewed source versions.');
  for (const document of documents) {
    const local = rows(pack.data, 'knowledge_documents').find(({ id }) => id === document.id);
    if (
      !local ||
      document.content_sha256 !== local.content_sha256 ||
      document.content_markdown !== local.content_markdown ||
      document.visibility !== 'public'
    )
      throw new Error('Source snapshot mismatch.');
  }
  if (process.argv.includes('--approval-sql')) {
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const evidence =
      'Project owner explicitly approved all seven supplied drafts in the implementation request: "All te drafts are approved, you can generate RAG systems from them." Recorded 2026-10-24; original Markdown snapshots are preserved.';
    const statements = documents.map(
      (doc) => `do $approval$ declare approval uuid; begin
      if not exists(select 1 from public.knowledge_documents where id=${quote(doc.id)}::uuid and content_sha256=${quote(doc.content_sha256)} and visibility='public') then raise exception 'Reviewed snapshot mismatch'; end if;
      insert into asterbyte_private.owner_knowledge_approvals(document_id,content_sha256,authorization_reference)
      values(${quote(doc.id)}::uuid,${quote(doc.content_sha256)},${quote(evidence)}) on conflict(document_id,content_sha256) do nothing;
      select id into approval from asterbyte_private.owner_knowledge_approvals where document_id=${quote(doc.id)}::uuid and content_sha256=${quote(doc.content_sha256)};
      update public.knowledge_documents set approval_status='approved',owner_approval_id=approval,approved_at=now()
      where id=${quote(doc.id)}::uuid and approval_status='draft';
    end $approval$;`,
    );
    await mkdir(resolve(workspaceRoot, 'supabase/.temp'), { recursive: true });
    await writeFile(
      resolve(workspaceRoot, 'supabase/.temp/approve-knowledge.sql'),
      `begin;\n${statements.join('\n')}\ncommit;\n`,
      'utf8',
    );
    console.log(
      'Exact-snapshot owner approval SQL generated under supabase/.temp; no approval executed.',
    );
    return;
  }
  if (documents.some((doc) => doc.approval_status !== 'approved'))
    throw new Error('Source approval not recorded yet.');
  let inserted = 0;
  let skipped = 0;
  for (const document of documents) {
    const contents = chunkMarkdown(document.content_markdown, document.title);
    const existing = z
      .array(z.object({ chunk_index: z.number(), content_sha256: z.string() }))
      .parse(
        await database.request(
          `knowledge_chunks?select=chunk_index,content_sha256&document_id=eq.${document.id}&document_sha256=eq.${document.content_sha256}&chunker_version=eq.${chunkerVersion}&embedding_model=eq.${embeddingModel}`,
        ),
      );
    if (
      existing.some(
        (row) =>
          !contents[row.chunk_index] ||
          contentHash(contents[row.chunk_index] ?? '') !== row.content_sha256,
      )
    )
      throw new Error('Existing chunk manifest conflicts with current sources.');
    skipped += existing.length;
    const missing = contents
      .map((content, index) => ({ content, index }))
      .filter((row) => !existing.some((e) => e.chunk_index === row.index));
    const newRows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < missing.length; offset += 4) {
      const batch = missing.slice(offset, offset + 4);
      const vectors = await embed(
        config,
        batch.map(({ content }) => content),
      );
      newRows.push(
        ...batch.map(({ content, index }, i) => ({
          document_id: document.id,
          document_sha256: document.content_sha256,
          chunk_index: index,
          content,
          content_sha256: contentHash(content),
          embedding_model: embeddingModel,
          chunker_version: chunkerVersion,
          embedding: JSON.stringify(vectors[i]),
        })),
      );
    }
    if (newRows.length) await database.request('knowledge_chunks', newRows);
    inserted += newRows.length;
    console.log(
      `${document.document_key}@${document.version}: ${contents.length} chunks verified.`,
    );
  }
  // Pack still reflects original draft snapshots, not a mechanism to overwrite live approvals.
  console.log(
    JSON.stringify({
      inserted,
      identicalSkipped: skipped,
      dimensions: 4096,
      model: embeddingModel,
    }),
  );
};
try {
  await main();
} catch {
  console.error(
    'Knowledge preparation/ingestion failed. Verify scope, snapshot approvals, migrations and provider access. No secrets or raw provider response logged.',
  );
  process.exitCode = 1;
}
