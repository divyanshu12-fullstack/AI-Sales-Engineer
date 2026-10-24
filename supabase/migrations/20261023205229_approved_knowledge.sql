-- Full 4096-dimensional Qwen vectors. Exact cosine search is appropriate for this small corpus.
-- Filename matches the migration API's assigned ledger version.
-- No ANN index: pgvector's vector HNSW limit is 2000 dimensions (halfvec is 4000, not 4096).
create extension if not exists vector with schema extensions;

create table asterbyte_private.owner_knowledge_approvals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete restrict,
  content_sha256 text not null,
  authorization_reference text not null check (length(authorization_reference) >= 20),
  recorded_at timestamptz not null default now(),
  unique (document_id, content_sha256)
);
revoke all on asterbyte_private.owner_knowledge_approvals from public, anon, authenticated, service_role;
grant usage on schema asterbyte_private to service_role;
grant select on asterbyte_private.owner_knowledge_approvals to service_role;

alter table public.knowledge_documents add column owner_approval_id uuid
  references asterbyte_private.owner_knowledge_approvals(id) on delete restrict;
create index documents_owner_approval_idx on public.knowledge_documents(owner_approval_id);
alter table public.knowledge_documents drop constraint knowledge_documents_check1;
alter table public.knowledge_documents drop constraint knowledge_documents_check2;
alter table public.knowledge_documents add constraint knowledge_approval_audit check (
  (approved_at is null and approved_by_admin_id is null and owner_approval_id is null and approval_status <> 'approved')
  or (approved_at is not null and ((approved_by_admin_id is not null)::integer + (owner_approval_id is not null)::integer) = 1)
);

create or replace function asterbyte_private.validate_knowledge_review() returns trigger
language plpgsql set search_path = '' as $$
declare reviewer uuid;
begin
  if tg_table_name = 'knowledge_documents' then
    if tg_op = 'UPDATE' then
      if old.approval_status in ('approved','retired') and (
        new.content_sha256 is distinct from old.content_sha256 or new.content_markdown is distinct from old.content_markdown
        or new.document_key is distinct from old.document_key or new.version is distinct from old.version
        or new.visibility is distinct from old.visibility or new.language is distinct from old.language
      ) then raise exception 'Approved knowledge is immutable; create a new reviewed version.'; end if;
    end if;
    if new.approval_status <> 'approved' then return new; end if;
    if new.owner_approval_id is not null then
      if not exists (select 1 from asterbyte_private.owner_knowledge_approvals a
        where a.id = new.owner_approval_id and a.document_id = new.id and a.content_sha256 = new.content_sha256
      ) then raise exception 'Owner authorization must match this exact document snapshot.'; end if;
      return new;
    end if;
    reviewer := new.approved_by_admin_id;
  else
    if new.review_status = 'pending' then return new; end if;
    reviewer := new.reviewed_by_admin_id;
  end if;
  if not exists (select 1 from public.admin_profiles where id = reviewer and is_active and role = 'admin') then
    raise exception using errcode = '23514', message = 'Knowledge review requires an explicitly active administrator.';
  end if;
  return new;
end;
$$;
drop trigger asterbyte_knowledge_review on public.knowledge_documents;
create trigger asterbyte_knowledge_review before insert or update on public.knowledge_documents
for each row execute function asterbyte_private.validate_knowledge_review();

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete restrict,
  document_sha256 text not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(content) between 1 and 6000),
  content_sha256 text not null check (content_sha256 = encode(sha256(convert_to(content,'UTF8')),'hex')),
  embedding_model text not null check (embedding_model = 'qwen/qwen3-embedding-8b'),
  chunker_version text not null check (chunker_version = 'markdown-sections-v1'),
  embedding extensions.vector(4096) not null check (extensions.vector_norm(embedding) > 0),
  created_at timestamptz not null default now(),
  unique (document_id, document_sha256, chunker_version, embedding_model, chunk_index)
);
alter table public.knowledge_chunks enable row level security;
revoke all on public.knowledge_chunks from public, anon, authenticated, service_role;
grant select on public.knowledge_chunks to authenticated;
grant select, insert on public.knowledge_chunks to service_role;
create policy active_admin_read on public.knowledge_chunks for select to authenticated
using ((select asterbyte_private.is_active_admin()));

create function asterbyte_private.validate_knowledge_chunk() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.knowledge_documents d where d.id = new.document_id
    and d.approval_status = 'approved' and d.content_sha256 = new.document_sha256
    and d.visibility = 'public') then raise exception 'Only approved public snapshots can be indexed.'; end if;
  return new;
end;
$$;
revoke all on function asterbyte_private.validate_knowledge_chunk() from public, anon, authenticated, service_role;
create trigger validate_knowledge_chunk before insert or update on public.knowledge_chunks
for each row execute function asterbyte_private.validate_knowledge_chunk();

create function public.search_company_knowledge(query_embedding extensions.vector(4096))
returns table(chunk_id uuid, document_id uuid, document_key text, version text, title text,
  source_path text, content text, similarity double precision)
language sql stable security invoker set search_path = '' as $$
  select c.id, d.id, d.document_key, d.version, d.title, d.source_path, c.content,
    1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks c join public.knowledge_documents d on d.id = c.document_id
  where d.approval_status = 'approved' and d.visibility = 'public' and d.content_sha256 = c.document_sha256
    and c.embedding_model = 'qwen/qwen3-embedding-8b' and c.chunker_version = 'markdown-sections-v1'
    and extensions.vector_dims(query_embedding) = 4096 and extensions.vector_norm(query_embedding) > 0
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= 0.35
  order by c.embedding operator(extensions.<=>) query_embedding, c.id limit 4;
$$;
revoke all on function public.search_company_knowledge(extensions.vector) from public, anon, authenticated, service_role;
grant execute on function public.search_company_knowledge(extensions.vector) to service_role;

comment on table public.knowledge_chunks is 'Approved public company documents only. No contacts, private projects, transcripts or candidates.';
comment on table asterbyte_private.owner_knowledge_approvals is 'Owner-only audit of explicit project-owner approval from outside Supabase Auth; never fabricates an Auth administrator.';
