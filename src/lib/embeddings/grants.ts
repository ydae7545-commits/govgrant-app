import "server-only";

import { getEmbeddingProvider } from "@/lib/llm/router";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phase 4: grant 텍스트 임베딩 생성 + grant_embeddings 테이블 적재.
 *
 * 어떤 텍스트를 임베딩할까?
 *   content = `${title}\n\n${summary}\n\n${requirements.join(" ")}\n\ntags: ${tags.join(" ")}`
 * 제목/요약/자격요건/태그를 연결. organization_name은 일부러 제외 —
 * "중소벤처기업부 창업정책과" 같은 게 섞이면 검색 쿼리의 의미와 노이즈로
 * 겹침. 향후 검색 품질이 안 좋으면 content builder만 바꾸고 전체 재임베딩.
 *
 * 모델: OpenAI text-embedding-3-small (1536 dim, $0.02/1M tokens).
 * 전체 7,250건 × 평균 500 tokens = 3.6M tokens → 약 $0.07. 사실상 무료.
 *
 * 배치 크기: OpenAI API는 한 번에 2048개까지 허용하지만, 네트워크 안정성
 * 차원에서 50개씩 끊어서 호출.
 */

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_VERSION = 1;
const BATCH_SIZE = 50;

export interface GrantRowForEmbedding {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  organization_name: string | null;
  tags: string[] | null;
  eligibility: Record<string, unknown> | null;
  source: string;
}

/**
 * 임베딩에 넣을 텍스트를 만든다. 이 함수의 출력 규칙이 바뀌면
 * embedding_version을 올리고 전체 재임베딩이 필요.
 */
export function buildEmbeddingContent(row: GrantRowForEmbedding): string {
  const parts: string[] = [];

  // 제목은 가장 강한 신호라 두 번 넣는다 (질의 매칭 가중치 효과).
  parts.push(row.title);
  parts.push(row.title);

  // 요약/설명 중 더 긴 걸 사용
  const body = (row.description ?? "").length > (row.summary ?? "").length
    ? row.description
    : row.summary;
  if (body) parts.push(body.slice(0, 1500));

  // LLM enrichment가 추출한 자격 요건
  const reqs =
    (row.eligibility?.requirements as string[] | undefined) ?? [];
  if (reqs.length > 0) {
    parts.push("자격 요건: " + reqs.join(", "));
  }

  // 태그 (enriched가 있으면 그게, 아니면 raw가 들어있음)
  const tags = row.tags ?? [];
  if (tags.length > 0) {
    parts.push("분야: " + tags.join(" "));
  }

  return parts.join("\n\n").trim();
}

export interface EmbedBatchResult {
  processed: number;
  inserted: number;
  skipped: number;
  failed: number;
  totalCostUsd: number;
  tookMs: number;
  errors: string[];
}

/**
 * Batch runner: pending (아직 임베딩 안 된) grants 행을 골라서
 * 임베딩 벡터를 만들고 grant_embeddings 에 upsert.
 *
 * "pending"의 정의: grants 행 중 grant_embeddings에 매칭되는
 * (grant_id, embedding_version) 쌍이 없는 것. 단순 left-join으로 처리.
 */
export async function embedPendingGrants(opts: {
  limit: number;
  sourceFilter?: string | null;
  userId?: string;
}): Promise<EmbedBatchResult> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  // 1. pending 행 뽑기
  //    left join 대신 NOT IN subquery가 Supabase REST 에서 더 단순해서 사용.
  const { data: embeddedIds, error: embedErr } = await supabase
    .from("grant_embeddings")
    .select("grant_id")
    .eq("embedding_version", EMBED_VERSION);

  if (embedErr) {
    return {
      processed: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      totalCostUsd: 0,
      tookMs: Date.now() - startedAt,
      errors: [`list embeddings failed: ${embedErr.message}`],
    };
  }

  const existingIds = new Set(
    (embeddedIds ?? []).map((r) => r.grant_id as string)
  );

  let query = supabase
    .from("grants")
    .select(
      "id, title, summary, description, organization_name, tags, eligibility, source"
    )
    .order("updated_at", { ascending: true })
    .limit(opts.limit * 4); // 넉넉히 가져와서 existingIds 제외한 후 limit로 컷

  if (opts.sourceFilter) {
    query = query.eq("source", opts.sourceFilter);
  }

  const { data: grants, error: grantsErr } = await query;
  if (grantsErr) {
    return {
      processed: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      totalCostUsd: 0,
      tookMs: Date.now() - startedAt,
      errors: [`list grants failed: ${grantsErr.message}`],
    };
  }

  const pending = (grants as GrantRowForEmbedding[])
    .filter((g) => !existingIds.has(g.id))
    .slice(0, opts.limit);

  if (pending.length === 0) {
    return {
      processed: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      totalCostUsd: 0,
      tookMs: Date.now() - startedAt,
      errors: [],
    };
  }

  // 2. 임베딩용 텍스트 빌드
  const contents = pending.map(buildEmbeddingContent);

  // 본문이 너무 짧은 건 skip (대부분 쓸모 없음)
  const pendingWithContent = pending
    .map((g, i) => ({ grant: g, content: contents[i] }))
    .filter((r) => r.content.length >= 30);
  const skipped = pending.length - pendingWithContent.length;

  if (pendingWithContent.length === 0) {
    return {
      processed: pending.length,
      inserted: 0,
      skipped,
      failed: 0,
      totalCostUsd: 0,
      tookMs: Date.now() - startedAt,
      errors: [],
    };
  }

  // 3. OpenAI 임베딩 호출 (BATCH_SIZE 단위로 쪼개서)
  const embedProvider = getEmbeddingProvider();
  const vectors: number[][] = new Array(pendingWithContent.length);
  let totalCost = 0;
  const errors: string[] = [];
  let failed = 0;

  for (let i = 0; i < pendingWithContent.length; i += BATCH_SIZE) {
    const slice = pendingWithContent.slice(i, i + BATCH_SIZE);
    try {
      const result = await embedProvider.embed(
        slice.map((r) => r.content),
        {
          userId: opts.userId ?? "system:embed-grants",
          model: EMBED_MODEL,
        }
      );
      totalCost += result.costUsd;
      for (let j = 0; j < slice.length; j++) {
        vectors[i + j] = result.vectors[j];
      }
    } catch (err) {
      failed += slice.length;
      errors.push(
        `batch ${i}-${i + slice.length}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 4. grant_embeddings 에 upsert
  const rowsToUpsert = pendingWithContent
    .map((r, i) => ({
      grant_id: r.grant.id,
      content: r.content,
      embedding: vectors[i],
      embedding_model: EMBED_MODEL,
      embedding_version: EMBED_VERSION,
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => Array.isArray(r.embedding));

  let inserted = 0;
  if (rowsToUpsert.length > 0) {
    const { error: upsertErr } = await supabase
      .from("grant_embeddings")
      .upsert(rowsToUpsert, { onConflict: "grant_id" });

    if (upsertErr) {
      errors.push(`upsert failed: ${upsertErr.message}`);
      failed += rowsToUpsert.length;
    } else {
      inserted = rowsToUpsert.length;
    }
  }

  return {
    processed: pending.length,
    inserted,
    skipped,
    failed,
    totalCostUsd: totalCost,
    tookMs: Date.now() - startedAt,
    errors,
  };
}
