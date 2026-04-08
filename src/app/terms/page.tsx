import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, ArrowLeft } from "lucide-react";

/**
 * /terms — 이용약관 페이지.
 *
 * 한국 정보통신망법 + 전자상거래법에 따라 회원 가입 / 유료 서비스 운영
 * 시 약관 게시 의무가 있음. 이 페이지는 **법무 검토 전 초안** 이며,
 * 정식 운영 전에 반드시 법무사 / 변호사 검토를 받아야 한다.
 *
 * 구조는 한국 SaaS 표준 약관 가이드 (한국인터넷진흥원 KISA) 를 참고:
 *   1. 총칙 — 목적, 정의
 *   2. 서비스 이용 — 가입, 탈퇴, 의무
 *   3. 책임의 한계 — 면책
 *   4. 분쟁 — 준거법, 관할
 *
 * Server Component — 인터랙션 0, SEO 친화적.
 */

export const metadata: Metadata = {
  title: "이용약관",
  description: "지원금 찾기 서비스 이용약관",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

const VERSION = "1.0";
const EFFECTIVE_DATE = "2026년 4월 8일";

export default function TermsPage() {
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
        <Landmark className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">이용약관</h1>
          <p className="mt-1 text-xs text-gray-500">
            버전 {VERSION} · 시행일 {EFFECTIVE_DATE}
          </p>
        </div>
      </header>

      <article className="prose prose-sm max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 1 조 (목적)
          </h2>
          <p className="text-sm leading-relaxed">
            본 약관은 &ldquo;지원금 찾기&rdquo; (이하 &ldquo;서비스&rdquo;)
            가 제공하는 정부지원금 ・ R&amp;D 과제 ・ 복지 서비스 검색 및
            맞춤 추천 ・ AI 사업계획서 작성 도우미 등 모든 관련 서비스의
            이용 조건과 절차, 회사와 회원의 권리 ・ 의무 ・ 책임 사항을
            규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 2 조 (정의)
          </h2>
          <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
            <li>
              <strong>회원</strong> 이란 본 약관에 동의하고 서비스에 가입한
              사용자를 말합니다.
            </li>
            <li>
              <strong>콘텐츠</strong> 란 서비스가 수집 ・ 가공하여 제공하는
              정부지원금 공고, 매칭 결과, AI 생성 사업계획서 등을 말합니다.
            </li>
            <li>
              <strong>포트폴리오</strong> 란 한 회원이 관리하는 다수의
              조직(기업/연구실 등)의 묶음을 말합니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 3 조 (약관의 효력 및 변경)
          </h2>
          <p className="text-sm leading-relaxed">
            본 약관은 회원 가입 시 동의함으로써 효력이 발생합니다. 회사는
            관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며,
            변경된 약관은 시행일 7일 전(회원에게 불리한 경우 30일 전)
            서비스 내 공지 또는 이메일로 통지합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 4 조 (회원 가입 및 탈퇴)
          </h2>
          <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
            <li>
              회원 가입은 Google ・ 카카오 등 OAuth 제공자를 통해 이루어
              지며, 회원이 본 약관과 개인정보 처리방침에 동의해야 합니다.
            </li>
            <li>
              회원은 언제든지 마이페이지에서 탈퇴할 수 있으며, 탈퇴 시
              회원 정보는 즉시 삭제됩니다 (단, 관련 법령에 따라 보존이
              필요한 정보는 일정 기간 보관할 수 있습니다).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 5 조 (서비스의 제공)
          </h2>
          <p className="text-sm leading-relaxed">
            회사는 다음 서비스를 제공합니다:
          </p>
          <ul className="ml-4 mt-1 list-disc space-y-1 text-sm leading-relaxed">
            <li>정부지원금 ・ R&amp;D 과제 ・ 복지 서비스 검색</li>
            <li>회원 프로필 ・ 조직 정보 기반 맞춤 추천</li>
            <li>마감 임박 알림 (이메일 ・ 인앱)</li>
            <li>AI 기반 사업계획서 작성 도우미</li>
            <li>그 밖에 회사가 정하는 부가 서비스</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 6 조 (콘텐츠의 정확성 및 책임의 한계)
          </h2>
          <p className="text-sm leading-relaxed">
            서비스가 제공하는 모든 정부지원금 정보는 공공데이터포털 등
            <strong> 외부 정부 API 에서 수집 ・ 가공한 자료</strong> 입니다.
            회사는 정확성을 위해 노력하지만 다음에 대해 책임지지 않습니다:
          </p>
          <ul className="ml-4 mt-1 list-disc space-y-1 text-sm leading-relaxed">
            <li>원본 공고와 가공된 정보의 차이</li>
            <li>마감일자 ・ 자격 요건 ・ 지원 금액 등의 변경 또는 오류</li>
            <li>사업 신청 결과 (선정 / 탈락) 와 관련된 모든 사항</li>
            <li>AI 생성 사업계획서 내용의 정확성 ・ 적합성</li>
          </ul>
          <p className="mt-2 text-sm leading-relaxed">
            회원은 반드시 <strong>원문 공고를 직접 확인</strong> 하여
            최종 신청 의사 결정을 해야 합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 7 조 (회원의 의무)
          </h2>
          <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
            <li>회원은 정확한 정보를 등록 ・ 관리할 의무가 있습니다.</li>
            <li>
              서비스를 부정 사용 (스크레이핑, API 남용, 자동 봇 운영 등)
              해서는 안 됩니다.
            </li>
            <li>
              타인의 정보 ・ 사업자등록번호를 도용해서는 안 됩니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 8 조 (서비스 중단 및 변경)
          </h2>
          <p className="text-sm leading-relaxed">
            회사는 시스템 점검 ・ 보수 ・ 운영상 필요 등에 의해 서비스를
            일시 중단할 수 있으며, 중요한 변경 사항은 사전 공지합니다.
            회사는 사업 환경 변화에 따라 서비스의 일부 또는 전부를 변경
            ・ 종료할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제 9 조 (분쟁 해결)
          </h2>
          <p className="text-sm leading-relaxed">
            본 약관과 관련하여 분쟁이 발생할 경우 회사와 회원은 성실히
            협의하여 해결합니다. 협의가 이루어지지 않는 경우 대한민국
            법률을 준거법으로 하며, 관할 법원은 민사소송법에 따릅니다.
          </p>
        </section>

        <section className="mt-12 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <strong>⚠ 중요 안내:</strong> 본 약관은 서비스 정식 출시 전
          초안이며, 최종 시행 전 법무 검토를 거쳐 보완될 수 있습니다.
          문의 사항은 운영자에게 연락해주세요.
        </section>
      </article>

      <div className="mt-12 flex items-center justify-between border-t pt-6 text-sm">
        <Link href="/privacy" className="text-blue-600 hover:underline">
          개인정보 처리방침 →
        </Link>
        <Link href="/" className="text-gray-500 hover:underline">
          홈으로
        </Link>
      </div>
    </div>
  );
}
