-- Phase 6.5: LLM enrichment 결과를 grants 테이블에 저장하기 위한 컬럼 확장.
--
-- 어댑터(MSIT/BIZINFO/MSS)는 API 응답을 그대로 normalize 해서 raw 데이터를
-- 적재한다. 그 후 enrich-grants route가 BIZINFO/MSS의 dataContents HTML을
-- LLM(gpt-4o-mini)에 넘겨서 정확한 금액·자격요건·우대사항·지원분야를
-- 구조화된 JSON으로 추출한 결과를 여기 칼럼들에 저장한다.
--
-- 이 마이그레이션은 idempotent (IF NOT EXISTS) 이므로 dev/prod 둘 다
-- 안전하게 다시 적용 가능.

-- ----------------------------------------------------------------------------
-- amount_label: LLM이 추출한 사람이 읽기 쉬운 금액 표현
--   예) "최대 3억원", "총 10억원 (10개사 × 1억)", "100만원~500만원"
-- 기존 amount_min/amount_max는 정수로 정밀 매칭에 쓰고, 이건 카드 표시용.
-- ----------------------------------------------------------------------------
alter table public.grants
  add column if not exists amount_label text;

-- ----------------------------------------------------------------------------
-- enrichment_status: 이 row가 LLM enrichment를 거쳤는지 추적
--   'pending'  | 아직 안 함 (어댑터가 적재한 직후 기본값)
--   'enriched' | LLM 호출 성공 + 데이터 채움
--   'skipped'  | 본문이 너무 짧거나 LLM이 의미있는 정보 못 추출
--   'failed'   | LLM/네트워크 에러 (다음 cron에서 재시도 가능)
-- ----------------------------------------------------------------------------
alter table public.grants
  add column if not exists enrichment_status text not null default 'pending';

-- ----------------------------------------------------------------------------
-- enriched_at: 마지막 enrichment 시각 (재처리 정책에 사용)
-- ----------------------------------------------------------------------------
alter table public.grants
  add column if not exists enriched_at timestamptz;

-- ----------------------------------------------------------------------------
-- enrichment_model: 어떤 모델로 enrich 했는지 (gpt-4o-mini 등)
-- ----------------------------------------------------------------------------
alter table public.grants
  add column if not exists enrichment_model text;

-- ----------------------------------------------------------------------------
-- enrichment_cost_usd: 이 row 한 건 enrichment에 든 LLM 비용
-- ----------------------------------------------------------------------------
alter table public.grants
  add column if not exists enrichment_cost_usd numeric(10, 6) default 0;

-- pending 행만 빠르게 골라내기 위한 인덱스 (cron이 batch로 처리할 때 사용)
create index if not exists grants_enrichment_status_idx
  on public.grants (enrichment_status)
  where enrichment_status = 'pending';

comment on column public.grants.amount_label is
  'Phase 6.5 LLM-extracted human-readable amount (e.g. "최대 3억원"). amount_min/max는 정수 매칭용.';
comment on column public.grants.enrichment_status is
  'Phase 6.5 enrichment lifecycle: pending | enriched | skipped | failed';
