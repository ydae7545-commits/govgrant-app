"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { ORG_KIND_LABELS, type OrgKind } from "@/types/user";

/**
 * /invitations/[token] — 초대 수락 페이지 (Phase 7).
 *
 * 흐름:
 *   1. 페이지 mount 시 GET /api/invitations/[token] 호출 → 조직 정보 표시
 *   2. 사용자가 "수락" 버튼 클릭 → POST /api/invitations/[token]/accept
 *   3. 성공 시 /portfolio/[orgId] 로 이동
 *
 * 로그인 상태 처리:
 *   - 로그인 안 됨 → 인라인 안내 + /auth/sign-in?next=/invitations/[token] 링크
 *   - 로그인 됨 → 수락 버튼 활성화
 *
 * 에러 케이스 (GET 응답 ok:false):
 *   - not_found, expired, already_accepted, org_deleted
 *   각각 친절한 메시지 + 홈으로 가는 CTA.
 */

interface InvitationData {
  organization: {
    id: string;
    name: string;
    kind: OrgKind;
    region: string;
  };
  inviterName: string;
  invitedEmail: string;
  expiresAt: string;
  role: "editor" | "viewer";
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function InvitationAcceptPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invitations/${token}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setErrorReason(json.reason ?? "unknown");
        } else {
          setInvitation(json);
        }
      } catch {
        if (!cancelled) setErrorReason("network");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setAcceptError(json.message ?? json.error ?? "수락에 실패했습니다.");
        return;
      }
      router.push(`/portfolio/${json.organizationId}`);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ----- 에러 케이스 -----
  if (errorReason || !invitation) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card className="p-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            {errorMessage(errorReason)}
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            {errorDescription(errorReason)}
          </p>
          <Button asChild className="w-full">
            <Link href="/">홈으로 이동</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // ----- 정상: 초대 정보 표시 -----
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-8">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <Building2 className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">팀 초대를 받았어요</h1>
          <p className="mt-1 text-sm text-gray-500">
            <strong>{invitation.inviterName}</strong>님이 초대했어요
          </p>
        </div>

        <div className="mb-6 rounded-lg border bg-gray-50 p-4">
          <div className="text-xs text-gray-500">조직</div>
          <div className="mt-1 text-base font-semibold text-gray-900">
            {invitation.organization.name}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {ORG_KIND_LABELS[invitation.organization.kind]} ·{" "}
            {invitation.organization.region}
          </div>
          <div className="mt-3 border-t pt-3 text-xs text-gray-500">
            역할:{" "}
            <strong className="text-gray-700">
              {invitation.role === "editor" ? "편집자" : "뷰어"}
            </strong>
            <br />
            받는 이메일: {invitation.invitedEmail}
          </div>
        </div>

        {acceptError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {acceptError}
          </div>
        )}

        {!user ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-gray-600">
              초대를 수락하려면 먼저 로그인이 필요해요.
              <br />
              <strong>{invitation.invitedEmail}</strong> 이메일로 로그인해주세요.
            </p>
            <Button asChild className="w-full">
              <Link
                href={`/auth/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`}
              >
                <LogIn className="mr-2 h-4 w-4" />
                로그인하고 수락하기
              </Link>
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full"
          >
            {accepting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {accepting ? "수락 중..." : "초대 수락하기"}
          </Button>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">
          {new Date(invitation.expiresAt).toLocaleDateString("ko-KR")}까지 유효
        </p>
      </Card>
    </div>
  );
}

function errorMessage(reason: string | null): string {
  switch (reason) {
    case "expired":
      return "초대가 만료되었어요";
    case "already_accepted":
      return "이미 수락된 초대예요";
    case "org_deleted":
      return "조직을 찾을 수 없어요";
    case "not_found":
      return "초대를 찾을 수 없어요";
    case "network":
      return "네트워크 오류";
    default:
      return "초대를 확인할 수 없어요";
  }
}

function errorDescription(reason: string | null): string {
  switch (reason) {
    case "expired":
      return "초대 링크의 유효 기간이 지났습니다. 운영자에게 다시 초대를 요청해주세요.";
    case "already_accepted":
      return "이 초대 링크는 이미 사용되었습니다. 마이페이지에서 가입된 조직을 확인해주세요.";
    case "org_deleted":
      return "초대된 조직이 삭제되었거나 더 이상 존재하지 않습니다.";
    case "not_found":
      return "유효하지 않은 초대 링크입니다. 운영자에게 새 링크를 요청해주세요.";
    case "network":
      return "잠시 후 다시 시도해주세요.";
    default:
      return "잠시 후 다시 시도해주세요.";
  }
}
