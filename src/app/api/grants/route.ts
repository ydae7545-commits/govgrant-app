import { NextRequest, NextResponse } from "next/server";
import { mockGrants } from "@/data/mock-grants";
import { daysUntil } from "@/lib/format";
import type { Grant, GrantStatus } from "@/types/grant";

function getGrantStatus(grant: Grant): GrantStatus {
  const daysToEnd = daysUntil(grant.applicationEnd);
  const daysToStart = daysUntil(grant.applicationStart);

  if (daysToStart > 0) return "\uBAA8\uC9D1\uC608\uC815";
  if (daysToEnd < 0) return "\uB9C8\uAC10";
  if (daysToEnd <= 7) return "\uB9C8\uAC10\uC784\uBC15";
  return "\uBAA8\uC9D1\uC911";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const keyword = searchParams.get("keyword") || "";
  const category = searchParams.get("category") || "";
  const targetType = searchParams.get("targetType") || "";
  const region = searchParams.get("region") || "";
  const status = searchParams.get("status") || "";
  const sort = searchParams.get("sort") || "deadline";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "12");

  let filtered = [...mockGrants];

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

  // Target type filter
  if (targetType && targetType !== "all") {
    filtered = filtered.filter((g) =>
      g.targetTypes.includes(targetType as Grant["targetTypes"][number])
    );
  }

  // Region filter
  if (region && region !== "all") {
    filtered = filtered.filter(
      (g) => g.region === region || g.region === "\uC804\uAD6D"
    );
  }

  // Status filter
  if (status && status !== "all") {
    filtered = filtered.filter((g) => getGrantStatus(g) === status);
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

  return NextResponse.json({ grants, total, page, totalPages });
}
