"use client";

import { useState } from "react";
import { Loader2, Mail, CheckCircle2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 조직에 팀원을 초대하는 모달 (Phase 7 B2B).
 *
 * UX:
 *   1. 운영자가 trigger 버튼 → 모달 오픈
 *   2. 이메일 입력 → "초대 보내기" 클릭
 *   3. POST /api/orgs/{orgId}/invitations 호출
 *   4. 성공 시:
 *      - "이메일을 보냈습니다" 메시지
 *      - acceptUrl 도 함께 표시 + 복사 버튼 (이메일 미수신 케이스 대비)
 *   5. 실패 시 인라인 에러 메시지
 *
 * 주의: 권한 검증은 서버 API 가 담당. 이 컴포넌트는 trigger 버튼이
 * 운영자에게만 노출되는지를 신경쓰지 않는다 — 호출하는 페이지가 해야 함.
 */

export interface InviteTeamDialogProps {
  orgId: string;
  orgName: string;
  /** Trigger 컨텐츠. 보통 Button 또는 IconButton. */
  children: React.ReactNode;
}

export function InviteTeamDialog({
  orgId,
  orgName,
  children,
}: InviteTeamDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    acceptUrl: string;
    emailSent: boolean;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail("");
    setSubmitting(false);
    setError(null);
    setResult(null);
    setCopied(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/invitations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(errorMessage(json.error));
        return;
      }
      setResult({
        acceptUrl: json.acceptUrl,
        emailSent: !!json.emailSent,
        expiresAt: json.expiresAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.acceptUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{orgName}에 팀원 초대</DialogTitle>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600">
              초대 받을 사람의 이메일을 입력하세요. 7일간 유효한 초대 링크가
              담긴 메일이 발송됩니다.
            </p>
            <div>
              <label
                htmlFor="invite-email"
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                이메일 주소
              </label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                required
                autoFocus
                disabled={submitting}
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              {submitting ? "초대 보내는 중..." : "초대 보내기"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="text-sm text-green-900">
                {result.emailSent ? (
                  <>
                    초대 메일을 발송했어요. 받는 사람이 메일에서 링크를
                    클릭하면 자동으로 조직에 합류합니다.
                  </>
                ) : (
                  <>
                    초대를 만들었지만 메일 발송에 실패했어요. 아래 링크를
                    직접 복사해서 전달해주세요.
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                초대 링크 (수동 전달용)
              </label>
              <div className="flex gap-2">
                <Input
                  value={result.acceptUrl}
                  readOnly
                  className="flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="링크 복사"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {new Date(result.expiresAt).toLocaleDateString("ko-KR")}까지
                유효
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="w-full"
            >
              다른 사람 초대하기
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(code: string | undefined): string {
  switch (code) {
    case "unauthorized":
      return "로그인이 필요합니다.";
    case "forbidden":
      return "이 조직의 운영자만 초대를 보낼 수 있습니다.";
    case "invalid_email":
      return "올바른 이메일 형식이 아닙니다.";
    case "invalid_json":
      return "요청 형식 오류";
    case "org_not_found":
      return "조직을 찾을 수 없습니다.";
    case "insert_failed":
      return "초대 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
    default:
      return code ? `오류: ${code}` : "초대 발송에 실패했습니다.";
  }
}
