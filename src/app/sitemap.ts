import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * /sitemap.xml — Next.js 16 file convention.
 *
 * 두 종류 URL 을 합쳐서 반환:
 *
 *   1. 정적 페이지 (홈, 검색, 캘린더, 챗) — 항상 포함, 변경 빈도 weekly
 *   2. 동적 grant 상세 (/grants/{id}) — Supabase 에서 마감되지 않은
 *      활성 공고만 추출. 한 번에 너무 많아지면 sitemap 분할이 필요한데
 *      현재 prod ~6,000건 정도라 단일 sitemap 으로 충분 (Google 한도
 *      50,000 URL).
 *
 * 생성 시점:
 *   - Next.js 가 빌드 시 캐시 + 일정 주기로 재생성. Request-time API
 *     를 사용하지 않으므로 ISR 동작과 동일.
 *   - Supabase 호출이 빌드 시 실패해도 정적 페이지만 반환되도록 try
 *     로 감싼다 — sitemap 자체가 빌드 실패 원인이 되면 안 됨.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://govgrant-app.vercel.app";

const STATIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/search", changeFrequency: "daily", priority: 0.9 },
  { path: "/calendar", changeFrequency: "daily", priority: 0.7 },
  { path: "/chat", changeFrequency: "monthly", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  // 동적 grant URLs — 마감되지 않은 활성 공고만.
  // Supabase 에 못 닿거나 RLS 차단되면 정적 URL만 반환.
  let grantEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("grants")
      .select("id, updated_at, application_end")
      .or(
        `application_end.is.null,application_end.gte.${now.toISOString().slice(0, 10)}`
      )
      .order("updated_at", { ascending: false })
      .limit(40000); // Google sitemap 50k URL 한도 안에서 여유

    if (!error && data) {
      grantEntries = data.map((row) => ({
        url: `${SITE_URL}/grants/${row.id}`,
        lastModified: row.updated_at
          ? new Date(row.updated_at as string)
          : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }
  } catch {
    // ignore — sitemap 빌드를 막지 말 것
  }

  return [...staticEntries, ...grantEntries];
}
