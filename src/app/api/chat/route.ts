import { NextRequest, NextResponse } from "next/server";
import { chatResponses, fallbackResponse } from "@/data/chat-responses";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const message: string = body.message || "";

  const normalized = message
    .toLowerCase()
    .trim()
    .replace(/[?？！!.,~]/g, "");

  // Find best matching response by keyword overlap
  let bestMatch = null;
  let bestScore = 0;

  for (const resp of chatResponses) {
    let score = 0;
    for (const kw of resp.keywords) {
      const kwLower = kw.toLowerCase();
      if (normalized.includes(kwLower)) {
        // Longer keyword matches get higher score (more specific)
        score += kwLower.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = resp;
    }
  }

  if (bestMatch && bestScore > 0) {
    return NextResponse.json({
      message: bestMatch.response,
      relatedGrantIds: bestMatch.relatedGrantIds || [],
      suggestions: bestMatch.followUpSuggestions || [],
    });
  }

  return NextResponse.json({
    message: fallbackResponse.response,
    relatedGrantIds: [],
    suggestions: fallbackResponse.followUpSuggestions || [],
  });
}
