# govgrant-app

정부지원금 · 국가 R&D 과제를 사용자 프로필에 맞춰 추천하는 AI 플랫폼.

**Live**: <https://govgrant-app.vercel.app>

---

## 한눈에 보기

- **타겟 사용자**: 개인(청년·구직자·복지 대상), 중소기업·스타트업, 연구기관·대학, 소상공인 — 모두 지원
- **핵심 가치**: 수천 개 공공 지원사업을 통합 수집하고, **AI가 사용자 조건에 맞춰 맞춤 추천** + (Phase 3 이후) **사업계획서 초안 자동 생성**
- **차별화**: 다중 소속기관 컨텍스트 전환, 기업부설연구소/전담부서 기반 자격 필터링, 기술분야 기반 컨소시엄 참여 과제 교차 추천, 생년월일·지역(구·군)·복지 특성 기반 개인 복지 매칭
- **현재 단계**: Phase 0 — 상용화 인프라 준비 완료, Phase 1 (인증 & DB 마이그레이션) 진입 예정

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프레임워크 | Next.js 16.2.2 (App Router, TypeScript) |
| 스타일 | Tailwind CSS 4 + shadcn/ui (Radix 기반) |
| 상태관리 | Zustand (localStorage persist, v1→v2 마이그레이션) |
| 호스팅 | Vercel (GitHub master auto-deploy) |
| **계획된 추가** (Phase 1+) | Supabase (Auth + PostgreSQL + pgvector), Anthropic Claude API, OpenAI API, Resend 이메일 |

---

## 현재 구현 상태

### ✅ 이미 구현된 기능 (Mock 데이터 기반)

- 53개 mock 과제 데이터 (9개 카테고리 × 17개 시·도 × 10개 R&D 분야)
- 개인 / 중소기업 · 스타트업 / 연구기관 · 대학 / 공공 · 비영리 · 기타 등 **6가지 기관 유형** 지원
- 다중 소속기관 등록 + 컨텍스트 탭 전환
- 점수 기반 매칭 엔진 (`src/lib/match-score.ts`): 지역·카테고리·태그·연령·연구소·컨소시엄 등 다차원 가중치
- 5단계 온보딩 (displayName → 개인정보 → 소속기관 → 관심분야 → 완료)
- 대시보드 / 검색 / 과제 상세 / 챗봇(키워드 매칭) / 캘린더 / 마이페이지
- 원문 보기 스마트 URL 폴백 (`src/lib/format.ts#getOriginalSourceUrl`)

### 🚧 Phase별 로드맵 (상용화 계획)

상세 내용: [`.claude/plans/bubbly-forging-newt.md`](.claude/plans/bubbly-forging-newt.md)

| Phase | 이름 | 예상 기간 |
|---|---|---|
| 0 | **인프라 준비** (Supabase 프로젝트, OAuth, LLM 키, Vercel env) | 1주 ✅ |
| 1 | **인증 & DB 마이그레이션** (Supabase Auth + Postgres, localStorage → DB) | 3주 |
| 2 | **LLM 인프라** (Claude/OpenAI 어댑터, 사용량 미터링, 일일 가드) | 1주 |
| 3 ⭐ | **AI 사업계획서 도우미 MVP** (7개 섹션 스트리밍 생성, DOCX 다운로드) | 3주 |
| 4 | **임베딩 & RAG** (pgvector, 의미 검색, RAG 챗봇) | 3주 |
| 5 | **알림 시스템** (Resend 이메일, D-7/3/1 마감 알림) | 2주 |
| 6 | **실데이터 파이프라인** (정부24·NTIS·K-Startup·소상공인24 API 통합) | 3주 |
| 7 | **B2B 포트폴리오 대시보드** (액셀러레이터 팀 포탈) | 2주 |
| 8 | **수익화** (Toss Payments 구독, 플랜별 한도) | 2주 |
| 9 | **운영/모니터링** (Sentry, PostHog, 어드민) | 1주 |
| 10 | **모바일 앱** (Expo, 선택) | 4주 |

---

## 로컬 개발 환경 구축

### 요구사항

- Node.js 20+ (권장)
- npm
- Vercel CLI (환경변수 동기화용, 최초 1회 설치)

### 1. 리포지토리 클론

```bash
git clone https://github.com/ydae7545-commits/govgrant-app.git
cd govgrant-app
npm install
```

### 2. 환경변수 세팅

#### 옵션 A — 이미 Vercel 프로젝트에 연결되어 있다면 (권장)

```bash
npm i -g vercel        # 최초 1회
vercel login           # 최초 1회
vercel link            # 최초 1회, 기존 프로젝트에 연결
vercel env pull .env.local
```

#### 옵션 B — 새 팀원 / 새 환경이라면

1. [`docs/SETUP.md`](docs/SETUP.md) 따라서 Supabase / Google / Kakao / Anthropic / OpenAI 계정과 키 발급
2. [`.env.example`](.env.example) 을 `.env.local`로 복사 후 실제 값 기입

```bash
cp .env.example .env.local
# .env.local 열어서 각 변수에 실제 값 붙여넣기
```

> ⚠️ `.env.local` 은 `.gitignore`에 의해 자동 제외됩니다. **실수로 커밋하지 않도록** 주의. 노출 시 [`docs/ENV.md`](docs/ENV.md)의 보안 원칙 참고.

### 3. 개발 서버 실행

```bash
npm run dev
```

<http://localhost:3000> 에서 확인.

### 4. 빌드 검증

```bash
rm -rf .next && npm run build
```

---

## 프로젝트 구조

```
govgrant-app/
├── src/
│   ├── app/                    # Next.js App Router 페이지
│   │   ├── page.tsx           # 랜딩
│   │   ├── onboarding/        # 5단계 온보딩
│   │   ├── dashboard/         # 홈 (추천, 마감 임박)
│   │   ├── search/            # 검색 & 필터
│   │   ├── grants/[id]/       # 과제 상세
│   │   ├── calendar/          # 마감 캘린더
│   │   ├── chat/              # AI 챗봇
│   │   ├── mypage/            # 마이페이지
│   │   └── api/               # Route Handlers
│   │       ├── grants/        # GET list/detail
│   │       ├── recommendations/  # POST 맞춤 추천
│   │       └── chat/          # POST 챗봇 (키워드 매칭, Phase 4에서 RAG로 교체 예정)
│   ├── components/
│   │   ├── ui/                # shadcn/ui 기본 컴포넌트 (Radix 기반)
│   │   ├── layout/            # header, mobile-nav
│   │   ├── profile/           # context-switcher, context-tabs, org-form, org-list, sign-in-banner
│   │   └── grant/             # grant-card
│   ├── lib/
│   │   ├── format.ts          # 날짜·금액 포매터, getOriginalSourceUrl, calculateAge
│   │   ├── match-score.ts     # 매칭 엔진 (순수 함수, MatchContext 기반)
│   │   └── constants.ts       # 업종·연구분야 목록
│   ├── data/
│   │   ├── mock-grants.ts     # 53개 과제 샘플 데이터
│   │   ├── mock-regions.ts    # 17개 시·도
│   │   ├── mock-sub-regions.ts  # 구·군 매핑
│   │   └── chat-responses.ts  # 챗봇 응답 뱅크
│   ├── store/
│   │   └── user-store.ts      # Zustand (UserAccount, persist v2, 마이그레이션 포함)
│   └── types/
│       ├── user.ts            # UserAccount, Organization, MatchContext, OrgKind 등
│       └── grant.ts           # Grant, GrantEligibility, 컨소시엄 정보 등
├── docs/
│   ├── SETUP.md               # Phase 0 외부 서비스 설정 전체 가이드
│   └── ENV.md                 # 환경변수 레퍼런스
├── .env.example               # 환경변수 템플릿
├── .claude/plans/             # 상용화 마스터 플랜 (Phase 0~10)
└── AGENTS.md                  # AI 개발자용 주의사항
```

---

## 개발 가이드

### 원칙

1. **기존 `UserAccount` 스키마 보존** — Phase 1에서 Supabase 테이블이 이 구조를 1:1 미러링
2. **순수 함수 `calculateMatchScore` 유지** — Phase 4 벡터 검색은 후보 축소 + 재랭킹에만 사용, 설명가능성 보존
3. **읽기는 Server Component / Route Handler, 쓰기는 Server Action**
4. **LLM 키는 100% 서버 전용** — `import "server-only"` 선언 필수
5. **Phase별 feature flag**로 즉시 롤백 가능 — `NEXT_PUBLIC_USE_*` 환경변수로 켜고 끄기

### Next.js 16 주의사항

⚠️ **이 프로젝트는 Next.js 16을 사용합니다**. 다음 API는 **비동기**로 변경됐습니다:

- `cookies()` — `await cookies()`
- `headers()` — `await headers()`
- `params` (동적 라우트) — `await params`
- `searchParams` — `await searchParams`

코드 작성 전 `node_modules/next/dist/docs/` 의 최신 가이드를 확인하세요. 자세한 주의사항은 [`AGENTS.md`](AGENTS.md) 참고.

### 커밋 메시지

현재까지의 커밋 스타일을 유지합니다 (한글 제목, 본문에 변경 이유 설명):

```
feat: 연구소·컨소시엄·개인복지 매칭 강화 (사무실 작업 재구현)

집 작업의 UserAccount/MatchContext 구조 위에서 사무실에서 했던
세 가지 기능을 새 구조에 맞게 다시 구현.

## 1. 기업부설연구소/전담부서 + 연구소 필수 과제 필터링
- ...
```

### 배포

- `master` 브랜치에 push → Vercel이 자동으로 Preview + Production 배포
- 수동 배포: `vercel --prod`

---

## 주요 문서

- [`docs/SETUP.md`](docs/SETUP.md) — Phase 0 외부 서비스 설정 전체 가이드 (Supabase, OAuth, LLM, Vercel env)
- [`docs/ENV.md`](docs/ENV.md) — 환경변수 레퍼런스 (용도 · 노출 가능 여부 · Phase)
- [`.env.example`](.env.example) — 환경변수 템플릿
- [`.claude/plans/bubbly-forging-newt.md`](.claude/plans/bubbly-forging-newt.md) — 상용화 마스터 플랜 (Phase 0~10 상세)
- [`AGENTS.md`](AGENTS.md) — AI 개발자용 주의사항 (Next.js 16 관련)

---

## 라이센스

본 서비스는 참고용 정보 제공 목적이며, 정확한 내용은 각 주관기관의 공식 공고를 확인해 주세요.

© 2026 govgrant-app. All rights reserved.
