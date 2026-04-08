import "server-only";

import { NextResponse, type NextRequest } from "next/server";

/**
 * Vercel Cron: daily grants pipeline.
 *
 * Runs once a day (configured in vercel.json). Orchestrates the three-step
 * grant data pipeline:
 *
 *   1. sync-grants   (fetch new public announcements from MSIT / BIZINFO / MSS)
 *   2. enrich-grants (LLM-extract tags / eligibility for pending rows)
 *   3. embed-grants  (OpenAI embeddings for pending rows)
 *
 * Each step runs independently — failure in step 2 doesn't block step 3.
 *
 * Auth:
 *   - Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` when
 *     calling this endpoint. Verify against env CRON_SECRET.
 *   - For manual runs (e.g. curl), also accept `Authorization: Bearer
 *     ${ADMIN_SYNC_TOKEN}` to reuse the existing manual-trigger secret.
 *
 * Hobby tier notes:
 *   - Cron runs at most once per day on Hobby, min interval 24h.
 *   - This route itself has maxDuration 60s; the individual sub-calls each
 *     respect that same limit. If the full pipeline needs more time, split
 *     into multiple cron entries (Pro tier) or reduce per-call batch sizes.
 *
 * Manual smoke test (doesn't need cron):
 *   curl -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
 *     "https://govgrant-app.vercel.app/api/cron/daily"
 */

export const runtime = "nodejs";
export const maxDuration = 60;

type StepResult = {
  step: string;
  ok: boolean;
  status: number;
  tookMs: number;
  body?: unknown;
};

async function callInternal(
  baseUrl: string,
  path: string,
  adminToken: string
): Promise<StepResult> {
  const started = Date.now();
  const step = path.replace(/^\/api\/admin\//, "").replace(/\?.*/, "");
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      // Avoid Next.js 16 fetch caching interference for admin operations.
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ error: "non_json" }));
    return {
      step,
      ok: res.ok,
      status: res.status,
      tookMs: Date.now() - started,
      body,
    };
  } catch (err) {
    return {
      step,
      ok: false,
      status: 0,
      tookMs: Date.now() - started,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function GET(request: NextRequest) {
  // ----- Auth -----
  const auth = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const adminToken = process.env.ADMIN_SYNC_TOKEN;

  if (!adminToken) {
    return NextResponse.json(
      { error: "missing_admin_token_env" },
      { status: 500 }
    );
  }

  const validCron = cronSecret && auth === `Bearer ${cronSecret}`;
  const validManual = auth === `Bearer ${adminToken}`;
  if (!validCron && !validManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Determine our own base URL so we can call sibling admin routes.
  //
  // Careful: VERCEL_URL points to the DEPLOYMENT-SPECIFIC host
  // (govgrant-xyz123-ydae7545-commits-projects.vercel.app) which is gated
  // by Vercel Deployment Protection. Internal fetches to that host bounce
  // with 401 HTML before reaching our handler.
  //
  // Use the PUBLIC alias instead:
  //   1. NEXT_PUBLIC_APP_URL env (e.g. https://govgrant-app.vercel.app)
  //   2. Fall back to the request's own origin (works for both prod alias
  //      and local dev)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const results: StepResult[] = [];

  // ----- Step 1: sync-grants for each source -----
  // MSIT: 10 pages × 10/page = 100 newest rows
  results.push(
    await callInternal(
      baseUrl,
      "/api/admin/sync-grants?source=msit&maxPages=10",
      adminToken
    )
  );

  // BIZINFO: 10 pages × 50/page = 500 newest rows (upserts existing by external_id)
  results.push(
    await callInternal(
      baseUrl,
      "/api/admin/sync-grants?source=bizinfo&maxPages=10&numOfRows=50",
      adminToken
    )
  );

  // MSS: 일일 트래픽 100건 제한이라 가볍게만
  results.push(
    await callInternal(
      baseUrl,
      "/api/admin/sync-grants?source=mss&maxPages=5&numOfRows=10",
      adminToken
    )
  );

  // ----- Step 2: enrich-grants (LLM) -----
  // 한 번에 30건 enrichment (Vercel 60s timeout 내에서 여유 있게)
  results.push(
    await callInternal(
      baseUrl,
      "/api/admin/enrich-grants?limit=30&source=BIZINFO",
      adminToken
    )
  );
  results.push(
    await callInternal(
      baseUrl,
      "/api/admin/enrich-grants?limit=20&source=MSS",
      adminToken
    )
  );

  // ----- Step 3: embed-grants (OpenAI) -----
  // 임베딩은 빠르므로 100건까지 가능
  results.push(
    await callInternal(
      baseUrl,
      "/api/admin/embed-grants?limit=100",
      adminToken
    )
  );

  const totalTook = results.reduce((s, r) => s + r.tookMs, 0);
  const anyFailed = results.some((r) => !r.ok);

  console.info(
    "[cron:daily]",
    JSON.stringify({
      steps: results.map((r) => ({
        step: r.step,
        ok: r.ok,
        status: r.status,
        tookMs: r.tookMs,
      })),
      totalTookMs: totalTook,
      anyFailed,
    })
  );

  return NextResponse.json(
    {
      ok: !anyFailed,
      totalTookMs: totalTook,
      results,
      triggeredBy: validCron ? "vercel-cron" : "manual",
    },
    { status: anyFailed ? 207 : 200 }
  );
}
