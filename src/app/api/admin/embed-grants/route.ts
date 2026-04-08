import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { embedPendingGrants } from "@/lib/embeddings/grants";

/**
 * POST /api/admin/embed-grants
 *
 * Generate OpenAI embeddings for grants that don't yet have a matching
 * row in public.grant_embeddings at the current embedding_version. Called
 * in batches by Vercel Cron after sync-grants / enrich-grants, or manually
 * for one-off backfills.
 *
 * Auth: Bearer ADMIN_SYNC_TOKEN (same gate as sync-grants / enrich-grants).
 *
 * Query params:
 *   ?limit=N         (default 50, hard cap 200)
 *   ?source=bizinfo  (optional) — only embed rows from one source
 *
 * Cost estimate: text-embedding-3-small is $0.02 per 1M tokens.
 *   grant 한 건 ≈ 500 tokens → 1,000건 ≈ $0.01
 *   7,250건 전체 백필도 약 $0.07.
 *
 * This route does NOT take the grants table lock — it reads pending rows
 * and upserts into a separate table. Safe to run concurrently with
 * sync-grants / enrich-grants although you'll want to sequence them in
 * the daily cron (sync → enrich → embed).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const HARD_CAP = 200;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.ADMIN_SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "missing_admin_token_env" },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clamp(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    1,
    HARD_CAP
  );
  const sourceFilter = url.searchParams.get("source");

  let result;
  try {
    result = await embedPendingGrants({
      limit,
      sourceFilter,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "embed_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  console.info(
    "[grants:embed]",
    JSON.stringify({
      processed: result.processed,
      inserted: result.inserted,
      skipped: result.skipped,
      failed: result.failed,
      totalCostUsd: result.totalCostUsd,
      tookMs: result.tookMs,
    })
  );

  return NextResponse.json({
    ok: result.failed === 0,
    ...result,
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
