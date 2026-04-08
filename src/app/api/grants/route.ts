import { NextRequest, NextResponse } from "next/server";
import { listAllGrants } from "@/lib/grants/repository";
import { daysUntil } from "@/lib/format";
import type { Grant, GrantStatus, UserType } from "@/types/grant";
import type { OrgKind } from "@/types/user";

function getGrantStatus(grant: Grant): GrantStatus {
  const daysToEnd = daysUntil(grant.applicationEnd);
  const daysToStart = daysUntil(grant.applicationStart);

  if (daysToStart > 0) return "모집예정";
  if (daysToEnd < 0) return "마감";
  if (daysToEnd <= 7) return "마감임박";
  return "모집중";
}

function orgKindToUserType(kind: string): UserType | null {
  switch (kind as OrgKind) {
    case "sme":
    case "sole":
      return "sme";
    case "research":
      return "research";
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const keyword = searchParams.get("keyword") || "";
  const category = searchParams.get("category") || "";
  const targetType = searchParams.get("targetType") || ""; // deprecated, 하위호환
  const contextKind = searchParams.get("contextKind") || ""; // "personal" | "org"
  const orgKind = searchParams.get("orgKind") || "";
  const region = searchParams.get("region") || "";
  const status = searchParams.get("status") || "";
  const sort = searchParams.get("sort") || "deadline";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "12");

  const { grants: allGrants, meta } = await listAllGrants();
  let filtered: Grant[] = [...allGrants];

  // Keyword search
  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter(
      (g) =>
        g.title.toLowerCase().includes(kw) ||
        g.summary.toLowerCase().includes(kw) ||
        g.tags.some((t) => t.toLowerCase().includes(kw)) ||
        g.organization.toLowerCase().includes(kw)
    );
  }

  // Category filter
  if (category) {
    filtered = filtered.filter((g) => g.category === category);
  }

  // Context filter (uppercase priority over deprecated targetType)
  if (contextKind === "personal") {
    filtered = filtered.filter((g) => g.targetTypes.includes("individual"));
  } else if (contextKind === "org") {
    const mapped = orgKindToUserType(orgKind);
    if (mapped) {
      filtered = filtered.filter((g) => g.targetTypes.includes(mapped));
    }
    // public/nonprofit/other 등 매핑 불가 기관은 전체 표시 (타입 보너스 없음)
  } else if (targetType && targetType !== "all") {
    // 구 파라미터 하위호환
    filtered = filtered.filter((g) =>
      g.targetTypes.includes(targetType as UserType)
    );
  }

  // Region filter
  if (region && region !== "all") {
    filtered = filtered.filter(
      (g) => g.region === region || g.region === "전국"
    );
  }

  // Status filter.
  //
  // Default behavior (no status param): hide expired grants. Phase 6는
  // 실데이터를 적재하면서 과거 공고까지 들어오기 때문에 기본값으로 이들이
  // 섞이면 사용자가 혼란스러워한다. 마감 과제는 명시적으로 "status=all"
  // 또는 "status=마감"을 요청할 때만 보인다.
  //
  // 추가로 applicationEnd가 아예 비어 있는 과제는 "기간 미확정" 취급 —
  // BIZINFO의 "예산 소진시까지" / MSIT처럼 본문에 날짜가 없는 경우가
  // 여기 해당. 이런 공고도 기본 표시에 포함해야 "여전히 모집 중"일 때
  // 누락되지 않음.
  if (status === "all") {
    // 필터 적용 안 함 (관리자/디버깅 용)
  } else if (status && status !== "") {
    filtered = filtered.filter((g) => getGrantStatus(g) === status);
  } else {
    filtered = filtered.filter((g) => {
      // applicationEnd가 비어 있으면 기간 미확정 → 표시
      if (!g.applicationEnd) return true;
      // 유효한 날짜가 있고 마감이면 제외
      return getGrantStatus(g) !== "마감";
    });
  }

  // Sort
  if (sort === "deadline") {
    filtered.sort(
      (a, b) =>
        new Date(a.applicationEnd).getTime() -
        new Date(b.applicationEnd).getTime()
    );
  } else if (sort === "amount") {
    filtered.sort((a, b) => b.amountMax - a.amountMax);
  } else if (sort === "latest") {
    filtered.sort(
      (a, b) =>
        new Date(b.applicationStart).getTime() -
        new Date(a.applicationStart).getTime()
    );
  }

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const grants = filtered.slice(start, start + limit);

  return NextResponse.json({
    grants,
    total,
    page,
    totalPages,
    source: meta.source, // "mock" | "supabase" — debug aid for the search page
  });
}
