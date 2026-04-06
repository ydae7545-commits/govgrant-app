import { NextRequest, NextResponse } from "next/server";
import { mockGrants } from "@/data/mock-grants";
import { calculateMatchScore } from "@/lib/match-score";
import type { UserProfile } from "@/types/user";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const profile: UserProfile | null = body.profile || null;

  const scored = mockGrants
    .map((grant) => ({
      ...grant,
      matchScore: calculateMatchScore(grant, profile),
    }))
    .filter((g) => g.matchScore >= 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12);

  return NextResponse.json({ grants: scored });
}
