import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, ArrowLeft, ShieldCheck } from "lucide-react";

/**
 * /privacy — 개인정보 처리방침.
 *
 * 한국 개인정보보호법 제30조에 따라 모든 개인정보처리자는 처리방침을
 * 공개해야 함. 필수 기재 사항:
 *   1. 처리 목적
 *   2. 처리 항목
 *   3. 보유 기간
 *   4. 제3자 제공
 *   5. 처리 위탁
 *   6. 정보주체 권리 + 행사 방법
 *   7. 안전성 확보 조치
 *   8. 책임자 + 연락처
 *
 * 본 페이지는 govgrant-app 의 실제 데이터 흐름 (Supabase + OAuth +
 * Anthropic + OpenAI + Resend) 을 기반으로 작성된 초안. 운영 시작 전
 * 법무 검토 필수.
 */

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "지원금 찾기가 처리하는 개인정보 항목 및 권리 안내",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const VERSION = "1.0";
const EFFECTIVE_DATE = "2026년 4월 8일";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        돌아가기
      </Link>

      <header className="mb-8 flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            개인정보 처리방침
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            버전 {VERSION} · 시행일 {EFFECTIVE_DATE}
          </p>
        </div>
      </header>

      <article className="space-y-8 text-sm leading-relaxed text-gray-700">
        <section>
          <p>
            지원금 찾기 (이하 &ldquo;서비스&rdquo;) 는 회원의 개인정보를
            중요하게 다루며, 「개인정보 보호법」 등 관련 법령을 준수합니다.
            본 처리방침은 서비스가 회원의 어떤 정보를, 어떤 목적으로,
            얼마나, 어떻게 처리하는지 안내합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            1. 수집하는 개인정보 항목
          </h2>

          <h3 className="mt-3 text-sm font-semibold text-gray-800">
            가. OAuth 가입 시 자동 수집
          </h3>
          <ul className="ml-4 list-disc space-y-1">
            <li>이메일 주소 (Google / 카카오 OAuth 응답)</li>
            <li>표시 이름 (display name) 또는 닉네임</li>
            <li>OAuth 식별자 (auth.users.id)</li>
          </ul>

          <h3 className="mt-3 text-sm font-semibold text-gray-800">
            나. 회원이 직접 입력하는 정보 (모두 선택)
          </h3>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>개인 프로필</strong>: 생년월일, 성별, 거주 지역,
              소득 수준, 가구 형태, 자녀/장애/보훈 여부
            </li>
            <li>
              <strong>조직 프로필</strong>: 조직명, 유형, 지역, 업력,
              종업원 수, 매출, 업종, 기술 분야, 인증, 사업자등록번호
            </li>
            <li>
              <strong>저장한 과제 / 최근 본 과제</strong>: 회원의 활동
              이력
            </li>
            <li>
              <strong>관심 분야</strong>: 카테고리 선택 (창업/R&amp;D/복지 등)
            </li>
          </ul>

          <h3 className="mt-3 text-sm font-semibold text-gray-800">
            다. 자동 수집 항목
          </h3>
          <ul className="ml-4 list-disc space-y-1">
            <li>접속 IP 주소 ・ User-Agent ・ 접속 일시 (Vercel 로그)</li>
            <li>서비스 이용 기록 (페이지 방문, 검색 키워드)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            2. 개인정보 처리 목적
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>회원 식별 및 로그인 유지</li>
            <li>
              회원 프로필 ・ 조직 프로필 기반 정부지원금 맞춤 추천
            </li>
            <li>마감 임박 ・ 신규 추천 공고 이메일 알림 (회원 동의 시)</li>
            <li>AI 사업계획서 생성 시 컨텍스트 활용</li>
            <li>서비스 부정 사용 방지 및 보안</li>
            <li>법령 준수 및 분쟁 해결</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            3. 개인정보 보유 및 이용 기간
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              회원 가입 정보 ・ 프로필: 회원 탈퇴 시까지. 탈퇴 즉시 영구
              삭제 (Supabase auth.users CASCADE).
            </li>
            <li>
              저장한 과제 ・ 최근 본 과제 ・ 사업계획서: 회원 탈퇴 시까지.
            </li>
            <li>
              접속 로그 (Vercel): 30일 (Vercel 기본 정책).
            </li>
            <li>
              관련 법령에 의해 보존이 필요한 정보 (예: 전자상거래법상
              계약 ・ 결제 기록) 는 해당 법령이 정한 기간 동안 보관.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            4. 개인정보의 제3자 제공
          </h2>
          <p>
            서비스는 회원의 개인정보를 외부에 제공하지 않습니다. 다만
            다음의 경우는 예외입니다:
          </p>
          <ul className="ml-4 mt-1 list-disc space-y-1">
            <li>회원이 사전에 동의한 경우</li>
            <li>법령에 의해 요구되는 경우 (수사 기관 등)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            5. 개인정보 처리 위탁
          </h2>
          <p>
            서비스는 원활한 운영을 위해 다음 외부 처리자에게 일부 업무를
            위탁합니다. 위탁받은 자는 본 처리방침에 의해서만 개인정보를
            처리할 수 있습니다.
          </p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="border p-2 text-left">위탁받는 자</th>
                <th className="border p-2 text-left">위탁 업무</th>
                <th className="border p-2 text-left">위탁 항목</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-2">Supabase Inc. (미국)</td>
                <td className="border p-2">DB 호스팅 ・ 인증</td>
                <td className="border p-2">회원 정보 전체</td>
              </tr>
              <tr>
                <td className="border p-2">Vercel Inc. (미국)</td>
                <td className="border p-2">웹 호스팅 ・ 서버리스 함수</td>
                <td className="border p-2">접속 IP, 요청 메타</td>
              </tr>
              <tr>
                <td className="border p-2">Anthropic PBC (미국)</td>
                <td className="border p-2">
                  AI 사업계획서 생성 ・ 공고 enrichment
                </td>
                <td className="border p-2">
                  회원이 입력한 사업 정보 (사업계획서 작성 시)
                </td>
              </tr>
              <tr>
                <td className="border p-2">OpenAI L.L.C. (미국)</td>
                <td className="border p-2">의미 검색 임베딩</td>
                <td className="border p-2">검색 키워드</td>
              </tr>
              <tr>
                <td className="border p-2">Resend Inc. (미국)</td>
                <td className="border p-2">이메일 발송</td>
                <td className="border p-2">회원 이메일, 발송 내용</td>
              </tr>
              <tr>
                <td className="border p-2">Google LLC / Kakao Corp.</td>
                <td className="border p-2">OAuth 인증</td>
                <td className="border p-2">OAuth 응답 (이메일, 이름)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            6. 정보주체의 권리 ・ 행사 방법
          </h2>
          <p>
            회원은 언제든지 다음 권리를 행사할 수 있습니다:
          </p>
          <ul className="ml-4 mt-1 list-disc space-y-1">
            <li>개인정보 열람 ・ 정정 ・ 삭제 요청</li>
            <li>처리 정지 요청</li>
            <li>이메일 수신 동의 철회 (마이페이지 → 알림 설정)</li>
            <li>회원 탈퇴 (마이페이지)</li>
          </ul>
          <p className="mt-2">
            대부분의 권리는 마이페이지에서 직접 행사할 수 있으며, 이메일로
            요청하실 수도 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            7. 개인정보의 안전성 확보 조치
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>기술적 조치</strong>: HTTPS 전 구간 암호화, Supabase
              Row Level Security (RLS) 로 회원별 데이터 격리, OAuth
              표준 (PKCE) 사용
            </li>
            <li>
              <strong>관리적 조치</strong>: 운영자 외 개인정보 접근 금지,
              관리자 페이지 분리
            </li>
            <li>
              <strong>물리적 조치</strong>: Supabase ・ Vercel 의 SOC 2
              인증 데이터센터 활용
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            8. 개인정보 보호 책임자
          </h2>
          <p>
            서비스의 개인정보 처리에 관한 문의 ・ 불만 ・ 피해 구제 요청은
            아래 책임자에게 연락해주세요. 신속히 답변해드리겠습니다.
          </p>
          <div className="mt-3 rounded-lg bg-gray-50 p-4 text-xs">
            <div>
              <strong>책임자</strong>: 서비스 운영자
            </div>
            <div className="mt-1">
              <strong>이메일</strong>: ydae7545@gmail.com
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            9. 처리방침의 변경
          </h2>
          <p>
            본 처리방침은 법령 ・ 정책 ・ 서비스 내용 변경에 따라 수정될
            수 있으며, 변경 사항은 시행 7일 전 (회원에게 불리한 경우 30일
            전) 서비스 내 공지 또는 이메일로 알립니다.
          </p>
        </section>

        <section className="mt-12 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <strong>⚠ 중요 안내:</strong> 본 처리방침은 서비스 정식 출시 전
          초안이며, 최종 시행 전 법무 검토를 거쳐 보완될 수 있습니다.
          처리방침의 모든 내용에 대해 의문이 있으면 책임자에게 연락해주세요.
        </section>
      </article>

      <div className="mt-12 flex items-center justify-between border-t pt-6 text-sm">
        <Link href="/terms" className="text-blue-600 hover:underline">
          ← 이용약관
        </Link>
        <Link href="/" className="text-gray-500 hover:underline">
          홈으로
        </Link>
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
        <Landmark className="h-3 w-3" />
        지원금 찾기
      </div>
    </div>
  );
}
