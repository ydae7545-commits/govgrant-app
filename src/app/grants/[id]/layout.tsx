import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 과제 상세 페이지 동적 metadata.
 *
 * grants/[id]/page.tsx 가 client component 라 generateMetadata 를 직접
 * export 할 수 없으므로 layout.tsx 로 분리. layout 은 server component
 * 이므로 Supabase 에 직접 fetch 가 가능하다.
 *
 * 효과:
 *   - 각 과제마다 고유한 <title> 과 <meta description>
 *   - 카카오톡 / 트위터 공유 시 카드 제목이 "지원금 찾기" 가 아니라
 *     실제 공고 제목으로 표시 → 클릭률 ↑
 *   - Google 검색 결과에 과제 제목이 그대로 노출
 *
 * 실패 케이스 (id 가 mock grant ID 거나 RLS 차단) 는 fallback metadata
 * 만 반환해서 페이지 자체는 그대로 렌더링되게 한다.
 */

interface Params {
  params: Promise<{ id: string }>;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://govgrant-app.vercel.app";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;

  // mock grant id 같이 UUID 가 아닌 경우엔 supabase 호출 자체가 실패하므로
  // try 로 감싸고 fallback metadata 만 반환.
  let grant: {
    title: string;
    summary: string | null;
    organization_name: string | null;
  } | null = null;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("grants")
      .select("title, summary, organization_name")
      .eq("id", id)
      .maybeSingle();
    if (data) grant = data;
  } catch {
    // ignore — fallback 처리
  }

  if (!grant) {
    return {
      title: "과제 상세",
      description: "정부지원금·R&D 과제 상세 정보",
      alternates: { canonical: `/grants/${id}` },
    };
  }

  const title = grant.title;
  const description =
    grant.summary?.slice(0, 160) ??
    `${grant.organization_name ?? "정부기관"} 의 지원사업 상세 정보`;

  return {
    title,
    description,
    alternates: { canonical: `/grants/${id}` },
    openGraph: {
      title: `${title} | 지원금 찾기`,
      description,
      url: `${SITE_URL}/grants/${id}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | 지원금 찾기`,
      description,
    },
  };
}

export default function GrantDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
