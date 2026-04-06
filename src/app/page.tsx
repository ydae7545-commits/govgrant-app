import Link from "next/link";
import {
  Landmark,
  Search,
  Bot,
  Bell,
  ArrowRight,
  User,
  Building2,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-4 py-20 text-white md:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur">
            <Landmark className="h-4 w-4" />
            정부지원금 & R&D 과제 추천 플랫폼
          </div>
          <h1 className="mb-6 text-4xl font-extrabold leading-tight md:text-5xl lg:text-6xl">
            나에게 딱 맞는
            <br />
            <span className="text-blue-200">정부지원</span>을 AI가 찾아드려요
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-blue-100 md:text-xl">
            수천 개의 정부지원금과 R&D 과제 중에서 내 조건에 맞는 프로그램을
            자동으로 추천받으세요. 개인, 중소기업, 연구기관 모두를 위한 원스톱
            서비스입니다.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="w-full bg-white text-blue-700 hover:bg-blue-50 sm:w-auto"
            >
              <Link href="/onboarding">
                무료로 시작하기
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-white/30 bg-transparent text-white hover:bg-white/10 sm:w-auto"
            >
              <Link href="/search">지원금 둘러보기</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-gray-900 md:text-3xl">
            이런 기능을 제공합니다
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Search className="h-8 w-8 text-blue-600" />}
              title="통합 검색"
              description="정부24, NTIS, K-Startup, 소상공인24 등 여러 플랫폼의 지원사업을 한 곳에서 검색하세요."
            />
            <FeatureCard
              icon={<Bot className="h-8 w-8 text-blue-600" />}
              title="AI 맞춤 추천"
              description="프로필을 입력하면 나이, 지역, 업종 등 조건에 맞는 지원사업을 AI가 자동으로 추천합니다."
            />
            <FeatureCard
              icon={<Bell className="h-8 w-8 text-blue-600" />}
              title="마감 알림"
              description="관심 있는 지원사업을 저장하면 마감일 전에 알림을 보내드립니다. 기회를 놓치지 마세요."
            />
          </div>
        </div>
      </section>

      {/* User Types */}
      <section className="bg-gray-50 px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-2xl font-bold text-gray-900 md:text-3xl">
            누구를 위한 서비스인가요?
          </h2>
          <p className="mb-12 text-center text-gray-500">
            모든 유형의 사용자에게 맞춤 정보를 제공합니다
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <UserTypeCard
              icon={<User className="h-10 w-10 text-purple-600" />}
              title="개인"
              items={[
                "청년 취업/창업 지원",
                "주거비 지원 (월세, 전세)",
                "출산/육아 급여",
                "직업훈련 교육비",
              ]}
              color="purple"
            />
            <UserTypeCard
              icon={<Building2 className="h-10 w-10 text-blue-600" />}
              title="중소기업 / 스타트업"
              items={[
                "창업 패키지 (예비/초기/도약)",
                "R&D 자금 지원",
                "정책자금 저금리 대출",
                "수출/마케팅 바우처",
              ]}
              color="blue"
            />
            <UserTypeCard
              icon={<GraduationCap className="h-10 w-10 text-green-600" />}
              title="연구기관 / 대학"
              items={[
                "NRF 연구과제",
                "IITP/KETEP R&D",
                "BK21 대학원 지원",
                "기술사업화 과제",
              ]}
              color="green"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900 md:text-3xl">
            지금 바로 시작하세요
          </h2>
          <p className="mb-8 text-gray-500">
            3분이면 프로필 설정이 완료됩니다. 맞춤 추천 결과를 바로
            확인해보세요.
          </p>
          <Button asChild size="lg" className="px-8">
            <Link href="/onboarding">
              맞춤 추천 받기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            <span className="font-medium">지원금 찾기</span>
          </div>
          <p>
            본 서비스는 참고용 정보 제공 목적이며, 정확한 내용은 각 주관기관의
            공식 공고를 확인해 주세요.
          </p>
          <p>&copy; 2026 지원금 찾기. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="rounded-xl bg-blue-50 p-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-500">{description}</p>
    </Card>
  );
}

function UserTypeCard({
  icon,
  title,
  items,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  color: "purple" | "blue" | "green";
}) {
  const bgMap = {
    purple: "bg-purple-50",
    blue: "bg-blue-50",
    green: "bg-green-50",
  };
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className={`w-fit rounded-xl ${bgMap[color]} p-3`}>{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 text-sm text-gray-600"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
