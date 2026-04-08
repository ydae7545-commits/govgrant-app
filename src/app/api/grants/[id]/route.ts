import { NextRequest, NextResponse } from "next/server";
import { findGrantById } from "@/lib/grants/repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const grant = await findGrantById(id);

  if (!grant) {
    return NextResponse.json(
      { error: "\uD574\uB2F9 \uC9C0\uC6D0\uC0AC\uC5C5\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
      { status: 404 }
    );
  }

  return NextResponse.json(grant);
}
