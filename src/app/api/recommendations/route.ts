import { NextRequest, NextResponse } from "next/server";
import { mockGrants } from "@/data/mock-grants";
import { calculateMatchScore } from "@/lib/match-score";
import type { MatchContext } from "@/types/user";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const context: MatchContext | null = body?.context ?? null;
  const limit: number = typeof body?.limit === "number" ? body.limit : 12;

  const scored = mockGrants
    .map((grant) => ({
      ...grant,
      matchScore: calculateMatchScore(grant, context),
    }))
    .filter((g) => g.matchScore >= 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  return NextResponse.json({ grants: scored });
}
