"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Landmark,
  ShieldCheck,
  ScrollText,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * /auth/consent — 약관 + 처리방침 강제 동의 페이지.
 *
 * 진입 경로:
 *   - OAuth callback 이 사용자가 약관 미동의 / 구버전 동의 상태일 때
 *     이 페이지로 redirect (?next=원래 가려던 URL)
 *
 * 흐름:
 *   1. 사용자가 약관/처리방침 두 체크박스 모두 체크
 *   2. "동의하고 계속" 클릭
 *   3. POST /api/account/consent { termsVersion, privacyVersion }
 *   4. 성공 시 next URL 로 router.push
 *
 * 약관/처리방침 본문은 별도 페이지 (`/terms`, `/privacy`) 로 새 탭에서
 * 열어서 읽을 수 있게 한다 (모달 안에 다 넣으면 너무 길어짐).
 *
 * 이 페이지는 server-side 강제 redirect 의 결과이므로, 사용자가 동의 안
 * 하고 다른 페이지로 가려고 해도 callback 이 다시 여기로 보낸다.
 */

const CURRENT_TERMS_VERSION = "1.0";
const CURRENT_PRIVACY_VERSION = "1.0";

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      }
    >
      <ConsentContent />
    </Suspense>
  );
}

function ConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = termsAgreed && privacyAgreed && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? "동의 저장에 실패했습니다.");
        return;
      }
      // 동의 완료 → 원래 가려던 URL 로
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-4 py-12">
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <Landmark className="h-5 w-5 text-blue-600" />
        <span className="text-base font-bold">지원금 찾기</span>
      </Link>

      <Card className="w-full p-8">
        <div className="mb-2 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            서비스 이용을 위한 동의
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            지원금 찾기를 사용하시려면 아래 두 가지에 동의해주세요.
          </p>
        </div>

        {/* 약관 박스 1: 이용약관 */}
        <div className="mt-6 space-y-3">
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ScrollText className="h-4 w-4 text-blue-600" />
                이용약관 (v{CURRENT_TERMS_VERSION})
              </div>
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                전문 보기 →
              </Link>
            </div>
            <p className="text-xs leading-relaxed text-gray-600">
              회원의 권리와 의무, 서비스 이용 조건, 콘텐츠 정확성 면책,
              분쟁 해결 절차 등을 규정합니다. 이용약관 페이지에서 전체
              내용을 확인하실 수 있어요.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-900">
                이용약관에 동의합니다 <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {/* 약관 박스 2: 개인정보 처리방침 */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                개인정보 처리방침 (v{CURRENT_PRIVACY_VERSION})
              </div>
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                전문 보기 →
              </Link>
            </div>
            <p className="text-xs leading-relaxed text-gray-600">
              수집하는 개인정보 항목 (이메일, 프로필, 조직 정보 등),
              처리 목적, 보유 기간, 위탁 처리자 (Supabase / Vercel /
              Anthropic 등), 정보주체의 권리 행사 방법을 안내합니다.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={privacyAgreed}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-900">
                개인정보 처리방침에 동의합니다{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-6 w-full"
          size="lg"
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {submitting ? "저장 중..." : "동의하고 계속"}
        </Button>

        <p className="mt-4 text-center text-xs text-gray-400">
          동의 시점, IP, 약관 버전이 분쟁 입증을 위해 기록됩니다.
        </p>
      </Card>

      <div className="mt-6 text-xs text-gray-400">
        동의하지 않으시면 서비스를 이용하실 수 없습니다.
        <br />
        <Link href="/" className="text-gray-500 hover:underline">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
