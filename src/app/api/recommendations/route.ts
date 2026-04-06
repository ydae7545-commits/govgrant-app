import { NextRequest, NextResponse } from "next/server";
import { mockGrants } from "@/data/mock-grants";
import { calculateMatchScore } from "@/lib/match-score";
import type { MatchContext } from "@/types/user";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const context: MatchContext | null = body?.context ?? null;
  const limit: number = typeof body?.limit === "number" ? body.limit : 12;

  // 모듈 전역 mockGrants에 누적될 수 있는 mutation을 제거
  for (const g of mockGrants) {
    delete g.consortiumMatch;
  }

  const scored = mockGrants
    .map((grant) => {
      // calculateMatchScore가 grant.consortiumMatch를 mutate할 수 있으므로
      // 점수를 먼저 계산한 뒤 spread하여 mutation을 보존한다.
      const matchScore = calculateMatchScore(grant, context);
      return {
        ...grant,
        matchScore,
        consortiumMatch: grant.consortiumMatch ?? false,
      };
    })
    .filter((g) => g.matchScore >= 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return NextResponse.json({ grants: scored });
}
