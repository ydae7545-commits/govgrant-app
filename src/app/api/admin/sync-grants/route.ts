import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { fetchMsitPage, normalizeMsitRow, type GrantDbRow } from "@/lib/data-sources/msit";
import { fetchBizinfoPage, normalizeBizinfoRow } from "@/lib/data-sources/bizinfo";
import { fetchMssPage, normalizeMssRow } from "@/lib/data-sources/mss";
import {
  fetchBokjiroCentralPage,
  fetchBokjiroLocalPage,
  normalizeBokjiroRow,
} from "@/lib/data-sources/bokjiro";
import { upsertGrantRows } from "@/lib/grants/repository";
import { serverEnv } from "@/lib/env.server";

/**
 * Admin endpoint for syncing real grant data into `public.grants`.
 *
 * Auth: requires `Authorization: Bearer <ADMIN_SYNC_TOKEN>` matching the
 * `ADMIN_SYNC_TOKEN` env var. This is a trivial bearer-token gate intended
 * for cron jobs and one-off manual runs — NOT user-facing.
 *
 * Behavior:
 *   1. Pulls pages from the MSIT 사업공고 OpenAPI until exhausted (or until
 *      `maxPages` is reached as a safety cap).
 *   2. Normalizes each row into our internal Grant DB shape.
 *   3. Upserts into `public.grants` keyed by `external_id`.
 *
 * Query params:
 *   ?source=msit            (only msit is implemented in this Phase 6 MVP)
 *   ?maxPages=N             (default 5, hard cap 50)
 *   ?numOfRows=N            (default 100, hard cap 1000)
 *   ?dryRun=1               (skip the upsert; useful for verifying parsing)
 *
 * Future: gov24, NTIS, K-Startup, 소상공인24 will be added as additional
 * `?source=` values, each with its own adapter under src/lib/data-sources/.
 *
 * Manual smoke test:
 *   curl -X POST -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" \
 *     "https://govgrant-app.vercel.app/api/admin/sync-grants?source=msit&maxPages=1&dryRun=1"
 */

const HARD_CAP_PAGES = 50;
const HARD_CAP_PER_PAGE = 1000;

/**
 * Pin this route to Vercel's Seoul region.
 *
 * bizinfo.go.kr (the 기업마당 API host) blocks requests from non-Korean
 * IP ranges — when the function ran from Vercel's US-East default it
 * returned `fetch failed` with no body. apis.data.go.kr (MSIT) is more
 * permissive but Korean-region execution is also strictly faster for
 * users in Korea, so pin everything in this route to icn1.
 */
export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // ----- Auth -----
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.ADMIN_SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        error: "missing_admin_token_env",
        message:
          "ADMIN_SYNC_TOKEN is not configured on the server. Set it in Vercel env first.",
      },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ----- Parse params -----
  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? "msit";
  const maxPages = clamp(
    parseInt(url.searchParams.get("maxPages") ?? "5", 10) || 5,
    1,
    HARD_CAP_PAGES
  );
  const numOfRows = clamp(
    parseInt(url.searchParams.get("numOfRows") ?? "100", 10) || 100,
    1,
    HARD_CAP_PER_PAGE
  );
  const dryRun = url.searchParams.get("dryRun") === "1";

  if (
    source !== "msit" &&
    source !== "bizinfo" &&
    source !== "mss" &&
    source !== "bokjiro_central" &&
    source !== "bokjiro_local"
  ) {
    return NextResponse.json(
      { error: "unsupported_source", message: `source=${source} not implemented yet` },
      { status: 400 }
    );
  }

  const env = serverEnv();
  const startedAt = Date.now();
  const collected: GrantDbRow[] = [];
  const pageStats: Array<{ pageNo: number; rows: number; total: number }> = [];
  let lastTotalCount = 0;

  try {
    if (source === "msit") {
      const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
      if (!serviceKey) {
        return NextResponse.json(
          {
            error: "missing_data_go_kr_key",
            message: "DATA_GO_KR_SERVICE_KEY env is not set",
          },
          { status: 500 }
        );
      }
      for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
        const page = await fetchMsitPage({ serviceKey, pageNo, numOfRows });
        lastTotalCount = page.totalCount;
        pageStats.push({ pageNo, rows: page.rows.length, total: page.totalCount });
        for (const row of page.rows) {
          const normalized = normalizeMsitRow(row);
          if (normalized) collected.push(normalized);
        }
        // MSIT API ignores numOfRows server-side and always returns 10/page.
        // Stop only on empty page or full collection.
        if (page.rows.length === 0) break;
        if (collected.length >= page.totalCount) break;
      }
    } else if (source === "bizinfo") {
      const crtfcKey = env.BIZINFO_API_KEY;
      if (!crtfcKey) {
        return NextResponse.json(
          {
            error: "missing_bizinfo_key",
            message: "BIZINFO_API_KEY env is not set",
          },
          { status: 500 }
        );
      }
      for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
        const page = await fetchBizinfoPage({
          crtfcKey,
          pageIndex,
          pageUnit: numOfRows,
        });
        lastTotalCount = page.totalCount;
        pageStats.push({ pageNo: pageIndex, rows: page.rows.length, total: page.totalCount });
        for (const row of page.rows) {
          const normalized = normalizeBizinfoRow(row);
          if (normalized) collected.push(normalized);
        }
        if (page.rows.length === 0) break;
        if (collected.length >= page.totalCount) break;
      }
    } else if (source === "mss") {
      // 중기부 API는 일일 트래픽이 100건으로 매우 작음. 자주 호출 금지.
      const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
      if (!serviceKey) {
        return NextResponse.json(
          {
            error: "missing_data_go_kr_key",
            message: "DATA_GO_KR_SERVICE_KEY env is not set",
          },
          { status: 500 }
        );
      }
      for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
        const page = await fetchMssPage({ serviceKey, pageNo, numOfRows });
        lastTotalCount = page.totalCount;
        pageStats.push({ pageNo, rows: page.rows.length, total: page.totalCount });
        for (const row of page.rows) {
          const normalized = normalizeMssRow(row);
          if (normalized) collected.push(normalized);
        }
        if (page.rows.length === 0) break;
        if (collected.length >= page.totalCount) break;
      }
    } else if (
      source === "bokjiro_central" ||
      source === "bokjiro_local"
    ) {
      const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
      if (!serviceKey) {
        return NextResponse.json(
          {
            error: "missing_data_go_kr_key",
            message: "DATA_GO_KR_SERVICE_KEY env is not set",
          },
          { status: 500 }
        );
      }
      const fetcher =
        source === "bokjiro_central"
          ? fetchBokjiroCentralPage
          : fetchBokjiroLocalPage;
      const variant = source === "bokjiro_central" ? "central" : "local";
      for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
        const page = await fetcher({ serviceKey, pageNo, numOfRows });
        lastTotalCount = page.totalCount;
        pageStats.push({
          pageNo,
          rows: page.rows.length,
          total: page.totalCount,
        });
        for (const row of page.rows) {
          const normalized = normalizeBokjiroRow(row, variant);
          if (normalized) collected.push(normalized);
        }
        if (page.rows.length === 0) break;
        if (collected.length >= page.totalCount) break;
      }
    }
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    return NextResponse.json(
      {
        error: "fetch_failed",
        message: e instanceof Error ? e.message : String(e),
        // Node 18+ wraps the underlying network error in `cause`. Surface it
        // so we can tell ENOTFOUND from ECONNREFUSED from EAI_AGAIN etc.
        cause: e?.cause ? String(e.cause) : undefined,
        pageStats,
      },
      { status: 502 }
    );
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      mode: "dryRun",
      source,
      pageStats,
      collected: collected.length,
      sample: collected.slice(0, 3),
      tookMs: Date.now() - startedAt,
    });
  }

  // ----- Upsert -----
  const upsertResult = await upsertGrantRows(collected);

  // Audit log: usage_events requires user_id (RLS shape designed for LLM
  // metering), so for system cron events we just emit a structured console
  // line. Vercel captures these in the function logs.
  console.info(
    "[grants:sync]",
    JSON.stringify({
      source,
      collected: collected.length,
      inserted: upsertResult.inserted,
      errors: upsertResult.errors,
      tookMs: Date.now() - startedAt,
    })
  );

  return NextResponse.json({
    ok: true,
    mode: "live",
    source,
    pageStats,
    collected: collected.length,
    upsert: upsertResult,
    sourceTotalCount: lastTotalCount,
    tookMs: Date.now() - startedAt,
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
