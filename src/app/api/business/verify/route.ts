import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyBusinessNo } from "@/lib/data-sources/nts";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/business/verify
 *
 * Body: { bNo: string }
 *
 * Verifies a 사업자등록번호 against the National Tax Service (국세청)
 * status API. Requires the user to be signed in — this prevents the
 * endpoint from being abused as a free NTS proxy. The result is returned
 * to the client; the caller is responsible for persisting it onto the
 * Organization row (we don't reach into Supabase from here because the
 * Organization edit flow is still client-side via Zustand).
 */

const RequestSchema = z.object({
  bNo: z.string().min(1),
});

export async function POST(request: NextRequest) {
  // Auth gate: must be a signed-in user. Anonymous abuse prevention only.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const env = serverEnv();
  const serviceKey = env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      {
        error: "missing_data_go_kr_key",
        message: "DATA_GO_KR_SERVICE_KEY env is not set on the server.",
      },
      { status: 500 }
    );
  }

  const result = await verifyBusinessNo({
    serviceKey,
    input: parsed.data.bNo,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 200 } // 200 with ok:false so the client can show a friendly message
    );
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
