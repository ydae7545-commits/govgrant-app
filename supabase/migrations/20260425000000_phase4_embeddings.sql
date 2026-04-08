-- Phase 4: pgvector + grant_embeddings + proposal_examples
--
-- Semantic search와 RAG 기반 사업계획서 생성을 위한 임베딩 인프라.
-- 임베딩 모델은 OpenAI text-embedding-3-small (1536 차원).
--
-- 이 마이그레이션은 idempotent (IF NOT EXISTS) 이므로 dev/prod 양쪽에
-- 안전하게 다시 적용 가능.

-- ----------------------------------------------------------------------------
-- pgvector extension
-- Supabase는 기본으로 pgvector를 지원하지만 enable 만 하면 됨.
-- ----------------------------------------------------------------------------
create extension if not exists vector;

-- ----------------------------------------------------------------------------
-- grant_embeddings: 각 grant row의 텍스트 임베딩
--
-- 왜 별도 테이블? grants 테이블에 vector 컬럼을 직접 두면 select *가
-- 항상 1536차원 배열을 반환해서 API 응답 페이로드가 커진다. 검색에
-- 필요할 때만 join하는 구조로 분리.
--
-- content: 임베딩의 원본 텍스트 (title + summary + tags + organization).
--          검색 품질을 바꾸고 싶으면 이 텍스트 생성 규칙을 고치고
--          전체 재임베딩하면 됨.
-- embedding_model: 어떤 모델로 만들었는지 (모델 버전 롤링 대비)
-- embedding_version: 같은 모델이라도 전처리 규칙이 바뀌면 버전 올림
-- ----------------------------------------------------------------------------
create table if not exists public.grant_embeddings (
  grant_id uuid primary key references public.grants(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  embedding_model text not null,
  embedding_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HNSW index for approximate nearest neighbor search.
-- m=16 ef_construction=64 는 pgvector 공식 권장 기본값.
-- 데이터가 수천~수만 건 규모라 HNSW가 ivfflat보다 빠르고 관리가 쉽다.
create index if not exists grant_embeddings_hnsw_idx
  on public.grant_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ----------------------------------------------------------------------------
-- proposal_examples: 과거에 성공한 사업계획서 / 제안서의 본문을 섹션 단위로
-- 쪼갠 RAG 컨텍스트 코퍼스. Phase 3의 proposal generator가 이걸 참조해서
-- 사용자 컨텍스트와 유사한 섹션을 주입한다.
--
-- 이 테이블은 Phase 4 두 번째 청크(청크 3)에서 본격적으로 사용.
-- 지금은 스키마만 깔아두고 데이터는 추후 수동 import 또는 크롤링으로 채움.
-- ----------------------------------------------------------------------------
create table if not exists public.proposal_examples (
  id bigserial primary key,
  source text not null,                -- 어디서 온 자료인지 (e.g. "K-Startup 사례집")
  source_url text,
  category text,                       -- Grant category와 동일한 분류 체계
  section text not null,               -- ProposalSectionKey (overview/market/...)
  title text,                          -- 원본 과제/제안서 제목
  content text not null,               -- 섹션 본문 텍스트
  embedding vector(1536) not null,
  embedding_model text not null,
  embedding_version int not null default 1,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists proposal_examples_section_idx
  on public.proposal_examples (section);

create index if not exists proposal_examples_hnsw_idx
  on public.proposal_examples
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ----------------------------------------------------------------------------
-- RLS: 읽기는 공개, 쓰기는 service_role 전용 (grants와 동일 정책)
-- ----------------------------------------------------------------------------
alter table public.grant_embeddings enable row level security;
alter table public.proposal_examples enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'grant_embeddings'
      and policyname = 'grant_embeddings_public_select'
  ) then
    create policy "grant_embeddings_public_select"
      on public.grant_embeddings for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'proposal_examples'
      and policyname = 'proposal_examples_public_select'
  ) then
    create policy "proposal_examples_public_select"
      on public.proposal_examples for select using (true);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- RPC 함수: semantic search용 코사인 유사도 top-k
--
-- 왜 RPC? pgvector 연산자(<=>)를 Supabase JS client에서 직접 쓰려면
-- .rpc()로 호출하는 게 가장 깔끔하고 안전하다 (문자열 인젝션 방지).
-- ----------------------------------------------------------------------------
create or replace function public.search_grants_by_embedding(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count int default 10
)
returns table (
  grant_id uuid,
  similarity float
)
language sql stable
as $$
  select
    ge.grant_id,
    1 - (ge.embedding <=> query_embedding) as similarity
  from public.grant_embeddings ge
  where 1 - (ge.embedding <=> query_embedding) >= match_threshold
  order by ge.embedding <=> query_embedding
  limit match_count;
$$;

-- 동일 패턴: proposal examples 유사도 검색
create or replace function public.search_proposal_examples_by_embedding(
  query_embedding vector(1536),
  target_section text default null,
  match_threshold float default 0.5,
  match_count int default 5
)
returns table (
  example_id bigint,
  similarity float
)
language sql stable
as $$
  select
    pe.id as example_id,
    1 - (pe.embedding <=> query_embedding) as similarity
  from public.proposal_examples pe
  where 1 - (pe.embedding <=> query_embedding) >= match_threshold
    and (target_section is null or pe.section = target_section)
  order by pe.embedding <=> query_embedding
  limit match_count;
$$;

comment on table public.grant_embeddings is
  'Phase 4: grant 텍스트 임베딩 (OpenAI text-embedding-3-small, 1536d).';
comment on table public.proposal_examples is
  'Phase 4: RAG 컨텍스트로 사용하는 사업계획서 섹션 코퍼스.';
