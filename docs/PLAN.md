# govgrant-app 상용화 마스터 플랜 (Phase 0~10)

## Context

**프로젝트**: 정부지원금·R&D 과제 추천 앱 (govgrant-app)
- 현재: Next.js 16.2.2 (App Router) + Tailwind 4 + shadcn(Radix) + Zustand + Vercel
- 데이터: mock 53건, localStorage 기반 인증, 키워드 매칭 챗봇
- 배포: https://govgrant-app.vercel.app, GitHub master 자동

**왜 이 플랜인가**
사용자가 "내가 추천한 모든 상용화 기능을 다 넣고 싶고, 특히 사용자 정보+과제 요건+선정 사례를 RAG로 분석해서 사업계획서 초안을 자동 생성하는 기능, 그리고 액셀러레이터/창업보육센터를 위한 포트폴리오사 사업계획서 자동화(B2B 팀 포탈+포트폴리오 대시보드)를 구현하기를 원함. 한 번에 다 만들면 망가지므로 11단계로 쪼개어 점진 마이그레이션."

**원칙**
1. 기존 `UserAccount` 스키마 보존 → Supabase 테이블이 1:1 미러
2. 순수 함수 `calculateMatchScore` 유지 → 벡터 검색은 후보 축소+재랭킹용으로만
3. 읽기는 Server Component/Route Handler, 쓰기는 Server Action
4. LLM 키는 100% 서버 전용 (`import "server-only"`)
5. Phase별 feature flag로 즉시 롤백 가능
6. **Next.js 16의 `cookies()`/`params`/`searchParams`는 비동기**. 각 Phase 시작 시 `node_modules/next/dist/docs/`에서 최신 API 문서 재확인 필수 (AGENTS.md 경고)

**사용자 결정 사항**
- LLM: Anthropic Claude (기본) + OpenAI (fallback) 둘 다
- DB/Auth: Supabase (PostgreSQL + pgvector + Auth)
- 로그인: Google + 카카오 둘 다
- B2B 범위: 기본 팀 포탈 + 포트폴리오 대시보드
- Phase 0 코드 작업은 사용자가 Supabase/Anthropic/OpenAI 키 발급 후 시작

---

## 전체 타임라인

| Phase | 이름 | 예상 주차 | 누적 |
|---|---|---|---|
| 0 | 인프라 준비 | 1주 | 1주 |
| 1 | 인증 & DB 마이그레이션 | 3주 | 4주 |
| 2 | LLM 인프라 | 1주 | 5주 |
| 3 | 사업계획서 도우미 MVP ⭐ | 3주 | 8주 |
| 4 | 임베딩 & RAG | 3주 | 11주 |
| 5 | 알림 시스템 | 2주 | 13주 |
| 6 | 실데이터 파이프라인 | 3주 | 16주 |
| 7 | B2B 포트폴리오 대시보드 | 2주 | 18주 |
| 8 | 수익화 (Toss Payments) | 2주 | 20주 |
| 9 | 운영/모니터링 | 1주 | 21주 |
| 10 | 모바일 앱 (Expo, 선택) | 4주 | 25주 |

**마일스톤**
- 8주차 (Phase 3 완료): 클로즈드 베타 5~10명 파일럿
- 13주차 (Phase 5 완료): 퍼블릭 베타 오픈
- 20주차 (Phase 8 완료): 정식 출시 + 유료화

---

## Phase 0 — 인프라 준비 (1주)

### 목표
코드 변경 없이 다음 Phase부터 Supabase/LLM을 붙일 수 있는 상태 만들기. 환경변수 표준화, 비밀 관리, 로컬 재현성 확보.

### 사용자 사전 준비
1. **Supabase 계정** → 프로젝트 2개: `govgrant-dev`(무료), `govgrant-prod`(Pro $25/월 권장)
   - Project URL, anon key, service_role key, DB password 확보
2. **Anthropic 콘솔** → API Key 발급 + 월 한도 $50
3. **OpenAI 플랫폼** → API Key 발급 + 월 한도 $30
4. **Google Cloud Console** → OAuth 2.0 Client (redirect: `https://<sb>.supabase.co/auth/v1/callback`)
5. **카카오 개발자 콘솔** → 애플리케이션 + REST API Key + Supabase Custom Provider 등록
6. **Vercel** → Production/Preview/Development env 분리 등록

### 구현 항목
**신규 파일**
- `.env.example` (전체 명세, 커밋 O)
- `.env.local` (실제 키, 커밋 X)
- `docs/SETUP.md` — 단계별 가이드
- `docs/ENV.md` — 변수별 용도/노출 가능 여부 표

**환경변수 명세** (`.env.example`)
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=         # 클라이언트 OK (RLS로 보호)
SUPABASE_SERVICE_ROLE_KEY=             # 서버 전용. NEXT_PUBLIC_ 금지

# LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
LLM_DEFAULT_PROVIDER=anthropic
LLM_FALLBACK_PROVIDER=openai
LLM_DEFAULT_MODEL_ANTHROPIC=claude-sonnet-4-5
LLM_DEFAULT_MODEL_OPENAI=gpt-4o-mini
LLM_MAX_DAILY_COST_USD_PER_USER=2.00

# Feature flags
NEXT_PUBLIC_USE_SUPABASE=false
NEXT_PUBLIC_USE_LLM_CHAT=false
NEXT_PUBLIC_USE_PROPOSAL_AI=false
NEXT_PUBLIC_USE_VECTOR_SEARCH=false

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development

# Phase 5+
RESEND_API_KEY=
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
```

**비밀 유지 규칙**
- `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`는 오직 Route Handler/Server Action/Edge Function에서만 import
- `src/lib/llm/`, `src/lib/supabase/server.ts`는 `import "server-only"` 선언

### 롤백 안전성
코드 변경 0. 문서/환경변수 명세만 추가.

### 검증
1. `npm run dev` → 기존 앱 동일 동작
2. Vercel 3개 환경에 모든 키 등록 확인
3. `vercel env pull`로 `.env.local` 재구성 가능

### 다음 Phase 의존성
Phase 1은 Supabase 키 + Vercel env 등록 완료 후 시작.

---

## Phase 1 — 인증 & DB 마이그레이션 (3주) ⭐

### 목표
localStorage 단일 스토어 → Supabase Postgres + Auth. 기존 UX 유지하면서 다기기 동기화 달성.

### 사전 준비
- Phase 0 완료
- Google/카카오 OAuth 등록 완료
- 사용자 합의: 첫 로그인 시 localStorage 자동 이관

### A. Supabase 스키마 (Phase 1+선행 준비)

```sql
-- 핵심 (Phase 1)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  active_context_id text not null default 'personal',
  completed_onboarding boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.personal_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  birth_date date,
  region text,
  sub_region text,
  income_level text check (income_level in ('저소득','중위소득','일반')),
  employment_status text check (employment_status in ('재직','구직','학생','기타')),
  household_type text check (household_type in ('1인','신혼','다자녀','일반')),
  has_children boolean not null default false,
  is_disabled boolean not null default false,
  is_veteran boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('sme','research','sole','public','nonprofit','other')),
  region text not null default '전국',
  business_age int,
  employee_count int,
  revenue numeric,
  industry text,
  tech_field text,
  research_field text,
  career_years int,
  has_research_institute boolean not null default false,
  has_research_department boolean not null default false,
  certifications text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.organizations (owner_user_id);

-- B2B 준비 (Phase 1에선 owner만 자동 생성)
create table public.org_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (organization_id, user_id)
);

create table public.user_interests (
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  primary key (user_id, category)
);

create table public.saved_grants (
  user_id uuid not null references public.users(id) on delete cascade,
  grant_id text not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, grant_id)
);

create table public.recent_views (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  grant_id text not null,
  viewed_at timestamptz not null default now()
);
create index on public.recent_views (user_id, viewed_at desc);

-- 선행 준비 (Phase 4/6)
create table public.grants (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  title text not null,
  summary text,
  description text,
  organization_name text,
  source text,
  category text not null,
  target_types text[] not null default '{}',
  region text not null default '전국',
  amount_min bigint,
  amount_max bigint,
  application_start date,
  application_end date,
  eligibility jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  url text,
  consortium jsonb,
  raw jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.grants (category);
create index on public.grants (application_end);
create index on public.grants using gin (tags);

-- Phase 3 (사업계획서)
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  grant_id text,
  title text not null,
  status text not null default 'draft' check (status in ('draft','in_progress','completed','archived')),
  sections jsonb not null default '{}'::jsonb,
  version int not null default 1,
  llm_model text,
  cost_estimate_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.proposals (user_id, updated_at desc);

create table public.proposal_versions (
  id bigserial primary key,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version int not null,
  sections jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- Phase 2/8 (사용량/구독)
create table public.usage_events (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6) not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on public.usage_events (user_id, created_at desc);

-- Phase 5 (알림)
create table public.notification_subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  email_enabled boolean not null default true,
  email_deadline_days int[] not null default '{7,3,1}',
  email_new_match boolean not null default true,
  kakao_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  grant_id text,
  payload jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  provider text,
  external_id text,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
```

### B. RLS 정책 (핵심)
- 모든 테이블 RLS ON
- `users`, `personal_profiles`, `user_interests`, `saved_grants`, `recent_views`, `proposals`, `notification_subscriptions`: `auth.uid() = user_id` 본인만
- `organizations`: `org_memberships`로 멤버만 select, owner만 write
- `org_memberships` 변경: service_role만 (Phase 7 서버 액션)
- `usage_events`: select만 본인, insert는 service_role
- `grants`: 전체 public select, write는 service_role

### C. 인증 흐름

**클라이언트 3종**
- `src/lib/supabase/client.ts` — 브라우저 (`createBrowserClient`)
- `src/lib/supabase/server.ts` — 서버 컴포넌트/Route Handler (`createServerClient`, `await cookies()`)
- `src/lib/supabase/admin.ts` — service_role (`import "server-only"`)

**미들웨어** (`src/middleware.ts`)
- 모든 요청에서 세션 갱신
- `/mypage`, `/calendar`, `/proposals/**`, `/portfolio/**` 보호
- `/onboarding`은 미완료 사용자만

**라우트**
- `src/app/auth/sign-in/page.tsx` (신규) — 카카오/Google 버튼
- `src/app/auth/callback/route.ts` (신규) — OAuth 콜백, 세션 교환

**훅**
- `src/hooks/use-auth.ts` — `onAuthStateChange` 구독, `{loading, session, user, signOut}`
- `src/hooks/use-account.ts` — auth user → 기존 `UserAccount` shape (컴포넌트 변경 최소화)

**기존 컴포넌트 수정**
- `src/components/layout/header.tsx` — `useAuth()` 기반 displayName/아바타
- `src/components/profile/sign-in-banner.tsx` — 카카오/Google 버튼
- `src/components/profile/context-switcher.tsx` — 데이터 소스만 Supabase 하이드레이션으로

### D. Zustand 스토어 재구성 (`src/store/user-store.ts`)
- `persist`는 캐시 스냅샷용으로만 (`partialize`)
- Truth는 Supabase
- `signIn(name)` 제거 → Supabase Auth가 대체
- 쓰기 액션: optimistic update → Supabase upsert → 실패 시 롤백
- 신규: `hydrateFromSupabase(userId)`, `pushToSupabase()` (이관용)
- `getActiveContext()` 시그니처 유지 → `match-score.ts` 영향 없음

### E. localStorage → Supabase 자동 이관
**`src/lib/migration/local-to-supabase.ts`** (신규)
- 첫 로그인 시 1회: localStorage 'govgrant-user' 읽기 → users/personal_profiles/organizations/org_memberships(owner)/user_interests/saved_grants/recent_views 일괄 insert
- 성공 시 `govgrant-migrated: true` 플래그
- 실패 시 Sentry + 사용자 토스트
- 트리거: `useAuth()`의 `SIGNED_IN` 핸들러
- 30일간 localStorage fallback 유지

### F. API 라우트 변경
- `src/app/api/grants/route.ts` — Phase 1에선 mockGrants 유지 (Phase 6 전환)
- `src/app/api/recommendations/route.ts` — POST body context 대신 server session 기반
- `src/app/api/grants/[id]/route.ts` — saved 여부 server session 기반 포함

### 신규 의존성
- `@supabase/ssr`, `@supabase/supabase-js`

### 데이터 마이그레이션
- 기존 익명 사용자가 첫 로그인 시 자동 이관 (E 참고)
- 실패해도 localStorage는 보존

### 롤백
`NEXT_PUBLIC_USE_SUPABASE=false` → 기존 Zustand 경로 즉시 복귀. 이미 Supabase에 이관된 데이터는 그대로.

### 검증
1. 새 브라우저에서 카카오 로그인 → 온보딩 → 다른 브라우저 같은 계정 로그인 시 동일하게 보임
2. 기존 localStorage 보유 브라우저로 최초 로그인 시 자동 이관
3. SQL editor: 다른 유저 행 anon key로 조회 시 빈 결과 (RLS 검증)
4. `/mypage` 미인증 접근 시 리다이렉트
5. E2E: 로그인 → 조직 추가 → 저장 → 로그아웃 → 재로그인 → 조직 보임

### 다음 Phase 의존성
Phase 2 metering, Phase 3 proposals 모두 Phase 1의 users 테이블 필수.

---

## Phase 2 — LLM 프로바이더 인프라 (1주)

### 목표
Claude/OpenAI 공통 어댑터, 토큰·비용·속도 일관 로깅. 사용자 노출 기능 변경 0.

### 신규 디렉터리 `src/lib/llm/`
```
src/lib/llm/
├── index.ts              # getLLM() 진입점
├── types.ts              # LLMProvider, LLMMessage, LLMResult, LLMStreamChunk
├── providers/
│   ├── anthropic.ts      # AnthropicProvider
│   └── openai.ts         # OpenAIProvider
├── router.ts             # 기본→fallback 자동 전환
├── cost.ts               # 모델별 단가 테이블
├── metering.ts           # usage_events 기록 (service_role)
├── guard.ts              # 일일 사용량/비용 가드
└── prompts/              # Phase 3에서 채움
```

### 인터페이스 (`src/lib/llm/types.ts`)
```ts
export interface LLMProvider {
  name: "anthropic" | "openai";
  complete(messages: LLMMessage[], opts: LLMCallOptions): Promise<LLMResult>;
  stream(messages: LLMMessage[], opts: LLMCallOptions):
    AsyncIterable<LLMStreamChunk> & { finalize(): Promise<LLMResult> };
  embed?(texts: string[], opts: { userId: string }):
    Promise<{ vectors: number[][]; costUsd: number; model: string }>;
}
```

### 비용 가드
- 호출 전후 `metering.record()` → `usage_events` insert
- `guard.canSpend(userId, est)`: 오늘 합계 vs `LLM_MAX_DAILY_COST_USD_PER_USER`
- 초과 시 429 + `{ error: "daily_limit_reached", limit, used }`

### 신규 의존성
- `@anthropic-ai/sdk`
- `openai`

### 신규 API 라우트
- `src/app/api/llm/complete/route.ts` — 내부 테스트 엔드포인트

### 롤백
순수 추가. 기존 경로 변경 0. 파일 삭제만으로 롤백.

### 검증
1. `/api/llm/complete`로 Claude/OpenAI 양쪽 응답 확인
2. `ANTHROPIC_API_KEY` 제거 → OpenAI 자동 fallback
3. `usage_events`에 cost_usd 적재 확인
4. 가드: 한도 0.01 설정 후 3회 호출 → 429

---

## Phase 3 — AI 사업계획서 도우미 MVP (3주) ⭐⭐⭐ 핵심 차별화

### 목표
로그인 사용자가 과제 상세에서 "사업계획서 초안 작성" → 사용자 프로필+조직+과제 요건 기반 7개 표준 섹션 스트리밍 생성. 섹션별 재생성/편집/버전 기록/DOCX 다운로드. **RAG 없이도 쓸만한 품질** 목표 (선정 사례 RAG는 Phase 4에서 추가).

### 데이터 모델 (`src/types/proposal.ts`)
```ts
export type ProposalSectionKey =
  | "overview"   // 사업 개요
  | "market"     // 시장 분석
  | "model"      // 사업 모델/기술 차별성
  | "plan"       // 추진 계획
  | "budget"     // 예산
  | "impact"     // 기대 효과
  | "team";      // 팀/수행 역량

export interface ProposalSection {
  content: string;          // Markdown
  generatedAt: string;
  model: string;
  tokens: { input: number; output: number };
  userEdited: boolean;
}
```

### 디렉터리 구조
```
src/
├── app/
│   ├── proposals/
│   │   ├── page.tsx                 # 내 사업계획서 목록
│   │   ├── new/page.tsx             # grantId 선택 → 생성 시작
│   │   └── [id]/
│   │       ├── page.tsx             # 에디터 (좌:목차 우:섹션)
│   │       └── download/route.ts    # GET ?format=md|docx
│   └── api/proposals/
│       ├── route.ts                 # POST(create), GET(list)
│       └── [id]/
│           ├── route.ts             # GET, PATCH, DELETE
│           ├── generate/route.ts    # POST 전체 생성 SSE
│           └── sections/[key]/route.ts  # POST 섹션 재생성 SSE
├── components/proposal/
│   ├── proposal-editor.tsx
│   ├── section-editor.tsx
│   ├── section-regenerate-button.tsx
│   ├── proposal-toolbar.tsx
│   ├── version-history.tsx
│   └── cost-indicator.tsx
├── lib/llm/prompts/
│   ├── proposal-system.ts           # 시스템: 한국어 사업계획서 전문가
│   ├── proposal-user.ts             # 사용자 컨텍스트 포매터
│   ├── proposal-sections.ts         # 섹션별 지시사항
│   └── proposal-refine.ts           # 재생성 프롬프트
└── hooks/use-proposal-stream.ts     # SSE 구독 훅
```

### 프롬프트 전략
- **시스템**: "한국 정부지원사업 사업계획서 작성 전문가. Markdown 출력, 각 섹션 H2, 불확실하면 `[보완 필요]` 플레이스홀더, 허위 수치 금지"
- **사용자**: 과제 정보(요건/금액/접수기간) + 지원자 정보(개인 또는 조직) + 관심분야 + 요청 섹션
- **섹션별 지시**:
  - `overview`: 4~6문단 (문제→해결책→성과 1줄→과제 부합성)
  - `market`: TAM/SAM/SOM 추정, 경쟁사 3곳, 페르소나
  - `budget`: 인건비/장비/외주/간접 구분, 총액 ≤ 지원금 상한
  - …

### 생성 흐름
1. 과제 상세에서 "초안 만들기" → `POST /api/proposals` → `/proposals/[id]`로 이동
2. 빈 섹션 7개 표시, "전체 생성" → `POST /api/proposals/[id]/generate` (SSE)
3. 서버: `getLLM().stream()`으로 섹션 7개 순차 생성, `event: section_done` / `event: delta`
4. 비용 가드 사전 체크, `usage_events` + `proposals.cost_estimate_usd` 누적
5. 사용자 편집 → `PATCH` → `userEdited: true` + 버전 증가
6. 섹션 재생성 → `POST /api/proposals/[id]/sections/[key]`

### 스트리밍
- Next 16 Route Handler의 `ReadableStream` 반환 SSE
- 클라이언트는 `EventSource` 또는 `fetch` ReadableStream
- Vercel AI SDK는 도입하지 않음 (LLM 어댑터 직접 보유)

### 버전 관리
- "저장" 시 `proposal_versions`에 스냅샷 insert
- UI: 버전 드로어 + "복원" 버튼

### 다운로드
- Markdown: 서버 concat → `text/markdown`
- DOCX: `docx` npm 패키지로 서버 빌드. Heading1 + Markdown 파라그래프 변환. 한글 폰트 임베디드 옵션 검토. 표/이미지는 v2.

### 비용 가드
- 1 proposal 전체: Claude Sonnet 4.5 ≈ 입력 5k+출력 8k × 7섹션 ≈ $0.3~0.5
- Free 플랜: 일 1 proposal + 섹션 재생성 5회
- 초과 시 Pro 구독 유도 UI (Phase 8 연동)

### 신규 의존성
- `docx` (DOCX 생성)
- `zod` (API payload 검증)

### 기존 코드 수정
- `src/app/grants/[id]/page.tsx` — "사업계획서 초안 만들기" CTA (로그인 + 플래그 ON)
- `src/components/layout/header.tsx`, `mobile-nav.tsx` — "내 사업계획서" 메뉴

### 롤백
`NEXT_PUBLIC_USE_PROPOSAL_AI=false` → 즉시 버튼/메뉴 숨김. proposals 테이블은 보존.

### 검증
1. 실제 K-Startup 3건 + R&D 2건으로 초안 생성, 5명 파일럿 평가 (3.5/5 이상 목표)
2. 섹션 재생성 후 이전 버전 복원 정상
3. DOCX를 한글/워드에서 정상 열람, 한글 깨짐 없음
4. 일일 한도 도달 시 429 + UI 안내
5. 비로그인 `/proposals/...` 접근 → 미들웨어 리다이렉트
6. 다른 사용자 proposal 강제 조회 → RLS 차단

### 다음 Phase 의존성
Phase 4 RAG는 prompt에 `[사례]` 컨텍스트만 추가. forward-compatible.

---

## Phase 4 — 임베딩 & RAG (3주, 개요)

### 목표
- pgvector 활성화, `grant_embeddings` 테이블 + ivfflat 인덱스
- 우선 mockGrants 임베딩으로 RAG 파이프라인 검증 (Phase 6 전)
- `/api/chat` 키워드 매칭 → Claude + 벡터 검색 RAG로 교체
- `/search`에 "의미 검색" 토글
- Phase 3 사업계획서에 "선정 사례" RAG 레이어 추가 (공개 PDF 수십~수백건 청킹/임베딩)

### 핵심 항목
- `embed()` 메서드 구현 (OpenAI `text-embedding-3-small`, 1536 차원)
- `src/lib/rag/` 신규: `chunker.ts`, `ingest.ts`, `retriever.ts`
- Supabase Edge Function: 야간 배치 임베딩 재계산
- 챗봇: 질문 → 임베딩 → top-k → LLM 컨텍스트 주입
- 협업 필터링 간단 버전: `recent_views` 기반 "비슷한 사용자가 본 과제"
- 설명가능성: 최종 점수 = 0.6 × `calculateMatchScore` + 0.4 × cosine

### 롤백
`NEXT_PUBLIC_USE_VECTOR_SEARCH=false` → 키워드 검색/챗봇 복귀.

---

## Phase 5 — 알림 시스템 (2주, 개요)

### 목표
- Resend(권장) 이메일 발송
- Vercel Cron 매일 09:00 KST: D-7/D-3/D-1 감지 + 신규 맞춤 과제 메일
- React Email 템플릿 (`src/lib/email/templates/`)
- 사용자 설정 UI: `/mypage/notifications`
- 카카오 알림톡은 Phase 5.5로 분리 (비즈 채널 심사 필요)

### 신규 의존성
- `resend`
- `@react-email/components`

### 롤백
Vercel Cron 비활성화 + `NEXT_PUBLIC_*` 플래그.

---

## Phase 6 — 실데이터 파이프라인 (3주, 개요)

### 목표
mockGrants 졸업. 정부24/NTIS/K-Startup/소상공인24 Open API 실시간 수집.

### 핵심 항목
- Supabase Edge Function `ingest-grants`, 소스별 어댑터 (`src/lib/ingest/sources/*.ts`)
- 매일 02:00 KST 스케줄. external_id + updatedAt diff
- LLM 정제: 원본 → Claude 구조화. 해시 diff로 변경된 항목만 재정제
- 실패 시 크롤러 fallback (Firecrawl 또는 Playwright)
- 임베딩 재계산 트리거 (Phase 4 연동)
- 어드민 모니터링 (실패 로그, 최신 수집 시간)

### 마이그레이션
- mockGrants id (string) → 실제 데이터 (uuid). 배포일에 `saved_grants.grant_id` uuid fk 변환. legacy 행은 자동 매핑 시도.

---

## Phase 7 — B2B 포트폴리오 대시보드 (2주, 개요)

### 목표
액셀러레이터/창업보육센터가 여러 포트폴리오사 등록 + 각 사별 추천/사업계획서 일괄 관리.

### 핵심 항목
- 신규 테이블 `teams` + `team_members` (고객사 자체)
- 기존 `organizations`는 포트폴리오사로 재사용
- `org_memberships.role`로 "팀원이 N개 포트폴리오사 관리" 패턴
- 신규 페이지:
  - `/portfolio` — 목록, 마감 캘린더, 추천 히트맵
  - `/portfolio/[orgId]` — 회사별 추천/사업계획서/메모
  - `/team/invite` — 매직링크 초대
- 일괄 생성: Supabase Edge Function + cron (정식: Trigger.dev/Inngest)
- RLS 멤버십 기반 확장

---

## Phase 8 — 수익화 (2주, 개요)

### 플랜
- **Free**: 일 1 proposal, 챗봇 20회, 이메일 알림만
- **Pro ₩19,900/월**: 일 5 proposal, 챗봇 무제한, 선정 사례 RAG, 카카오 알림톡
- **Business ₩99,000/월**: 팀 5명, 포트폴리오 20개사, 어드민 대시보드

### 핵심 항목
- 결제: **Toss Payments** (한국 우선) + Stripe (해외)
- `subscriptions` 테이블, Toss webhook 라우트, `src/lib/billing/`
- Phase 2 `guard.ts`에 plan-aware 한도

---

## Phase 9 — 운영/모니터링 (1주, 개요)

- **Sentry** (`@sentry/nextjs`): 서버/클라 에러 + LLM 호출 실패 + Release source map
- **PostHog**: 클라+서버 이벤트, 퍼널 분석
  - `signed_in`, `grant_viewed`, `grant_saved`, `proposal_generated`, `proposal_downloaded`, `subscription_started`
- **어드민 패널** `/admin` (role=admin): 사용자 수, proposal 수, 비용 누적, 실패 큐, 수동 임베딩 트리거
- Vercel Logs + Supabase Logs 연동

---

## Phase 10 (선택) — 모바일 앱 (4주, 개요)

- **Expo (React Native)**, 별도 리포
- npm workspace로 `src/lib/llm`, `src/types` 공유
- 화면: 홈/검색/상세/저장/마이. 사업계획서는 v1에서 조회·다운로드만
- Expo Push Notifications + `device_tokens` 테이블
- 인증: Supabase Auth OAuth 딥링크 + 카카오 네이티브 SDK
- 스토어 심사: AI 생성 기능에 대한 OpenAI/Anthropic usage policy 준수 명시

---

## Critical Files for Implementation

**기존 파일 (수정될)**
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\store\user-store.ts` — Phase 1에서 Supabase 하이드레이션으로 재구성
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\types\user.ts` — Phase 1에서 Supabase 응답 타입과 호환 확인
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\lib\match-score.ts` — Phase 4에서 cosine 점수와 결합. 시그니처 유지
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\app\api\recommendations\route.ts` — Phase 1에서 server session 기반으로 변경
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\app\layout.tsx` — Phase 1에서 미들웨어/Provider 추가
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\components\layout\header.tsx` — Phase 1에서 useAuth 기반
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\components\profile\sign-in-banner.tsx` — Phase 1에서 OAuth 버튼
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\app\grants\[id]\page.tsx` — Phase 3에서 "사업계획서 초안" CTA
- `C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app\src\app\api\chat\route.ts` — Phase 4에서 RAG 챗봇으로 교체

**신규 파일 (대표)**
- `.env.example`, `docs/SETUP.md`, `docs/ENV.md` — Phase 0
- `src/lib/supabase/{client,server,admin}.ts` — Phase 1
- `src/lib/migration/local-to-supabase.ts` — Phase 1
- `src/middleware.ts` — Phase 1
- `src/app/auth/{sign-in/page.tsx, callback/route.ts}` — Phase 1
- `src/hooks/{use-auth.ts, use-account.ts}` — Phase 1
- `supabase/migrations/*.sql` — Phase 1
- `src/lib/llm/**` — Phase 2
- `src/types/proposal.ts`, `src/app/proposals/**`, `src/app/api/proposals/**`, `src/components/proposal/**`, `src/lib/llm/prompts/**` — Phase 3

---

## 주의사항 & 리스크

1. **Next 16 브레이킹 체인지**: `cookies()`, `params`, `searchParams` 모두 비동기. 각 Phase 시작 시 `node_modules/next/dist/docs/01-app/03-api-reference/`에서 해당 API 문서 재확인 필수
2. **LLM 비용 폭주 방지**: Phase 3 출시 전 일일 가드 + 플랜별 한도 필수. 파일럿 단계 `LLM_MAX_DAILY_COST_USD_PER_USER=2`
3. **RLS 구멍**: Phase 1 완료 후 다른 사용자 행 강제 조회 수동 테스트. service_role 키가 클라이언트 번들에 포함되지 않는지 `next build` 결과 grep
4. **데이터 저작권**: Phase 6 정부24/NTIS는 공공데이터포털 등록·이용약관. K-Startup 별도 승인 가능
5. **개인정보**: 소득·장애·보훈은 민감정보. 개인정보처리방침/동의 절차 필수. Phase 8 전 법무 검토
6. **카카오 알림톡**: 사업자 등록 + 비즈 채널 심사 1~2주. Phase 5 시작 시점에 미리 신청
7. **마이그레이션 무손실**: localStorage → Supabase 이관 실패해도 localStorage는 30일간 보존, 사용자가 데이터 잃지 않게

---

## 즉시 실행 순서 (협업 모드)

### 사용자가 먼저 해야 할 것 (Phase 0)
1. Supabase 프로젝트 2개 (`govgrant-dev`, `govgrant-prod`) 생성, 각각의 URL/anon key/service_role key 확보
2. Anthropic Console에서 API Key 발급 + 월 한도 $50
3. OpenAI Platform에서 API Key 발급 + 월 한도 $30
4. Google Cloud Console에서 OAuth 2.0 Client 생성 (redirect: `https://<sb>.supabase.co/auth/v1/callback`)
5. 카카오 개발자 콘솔에서 애플리케이션 + REST API Key 발급
6. Vercel govgrant-app 프로젝트의 Production/Preview/Development env에 위 키들 등록
7. 위 키들을 안전하게 1Password/Bitwarden에 저장

### 그 후 다음 세션에서 시작 (AI가 코드 작업)
- Week 1: Phase 0 — `.env.example`, `docs/SETUP.md`, `docs/ENV.md` 작성. dev 서버 동작 검증
- Week 2~4: Phase 1 — Supabase 마이그레이션 SQL, 클라이언트 3종, 미들웨어, 로그인 화면, 콜백, Zustand 리팩터, localStorage 이관 로직, RLS 검증
- Week 5: Phase 2 — `src/lib/llm/` 골격 + Anthropic/OpenAI 어댑터 + metering + guard
- Week 6~8: Phase 3 — proposal 데이터 모델 + API 라우트 + 에디터 UI + 프롬프트 + 스트리밍 + DOCX 다운로드 + 파일럿 검증

### 각 세션마다
- 시작: 이 plan 파일 + 직전 세션 마지막 commit 확인
- 작업: 현재 Phase의 작은 단위 (1~3개 파일) 단위로 commit
- 검증: 빌드 + dev 서버 스모크 테스트 + 필요 시 mcp__Claude_Preview로 UI 확인
- 종료: GitHub push + Vercel preview 배포 확인 + 다음 단계 정리

---

## 부록 A — Phase 0 키 발급 단계별 가이드 (사용자용)

> **소요 시간 추정**: 처음이라면 약 90분~2시간. 카카오만 등록 절차가 좀 복잡하고 나머지는 5~15분.
> **사전 준비**: 신용카드(Anthropic/OpenAI 결제용, 무료 크레딧 소진 후 사용), 본인 인증용 휴대폰, 기존 GitHub 계정.
> **결과물**: 6개 서비스의 키들이 안전한 곳(1Password/Bitwarden 권장)에 저장되고, Vercel env에 등록된 상태.

---

### 1. Supabase 프로젝트 생성 (15분, 가장 먼저)

**왜?** 다른 OAuth(Google/카카오) 등록 시 Supabase 콜백 URL이 필요해서 이걸 먼저 만들어야 함.

**단계**:
1. https://supabase.com → "Start your project" → GitHub 계정으로 가입
2. 새 organization 생성 (이름: 본인 이름 또는 회사명)
3. **`govgrant-dev` 프로젝트 생성**
   - Project name: `govgrant-dev`
   - Database password: **강력한 패스워드 생성 후 1Password에 저장** (재발급 안 됨)
   - Region: `Northeast Asia (Seoul)` (`ap-northeast-2`)
   - Pricing plan: **Free** (Phase 1~3 동안 충분)
   - "Create new project" 클릭 → 약 2분 대기
4. **`govgrant-prod` 프로젝트 생성** (위와 동일하되 이름만 다름)
   - 처음에는 Free로 시작, Phase 5 출시 무렵 Pro($25/월)로 업그레이드 권장 (PITR + RLS 감사 로그)

**키 확보**:
각 프로젝트에서 좌측 메뉴 **Settings → API** 클릭, 다음 3개 값 복사:
- **Project URL**: `https://xxxxx.supabase.co` (`NEXT_PUBLIC_SUPABASE_URL`)
- **anon public**: `eyJhbGc...` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- **service_role secret**: `eyJhbGc...` ⚠️ **클라이언트 노출 절대 금지** (`SUPABASE_SERVICE_ROLE_KEY`)

dev/prod 두 세트 모두 1Password에 별도 항목으로 저장.

**확인**: Supabase 대시보드에 두 프로젝트가 보이고 "Healthy" 상태.

---

### 2. Google OAuth 등록 (10분)

**단계**:
1. https://console.cloud.google.com 접속 → Google 계정 로그인
2. 상단 드롭다운 → **"새 프로젝트"** 클릭
   - 프로젝트 이름: `govgrant`
3. 프로젝트 선택 후 좌측 메뉴 → **"API 및 서비스" → "OAuth 동의 화면"**
4. **External** 선택 → "만들기"
5. 앱 정보 입력:
   - 앱 이름: `지원금 찾기`
   - 사용자 지원 이메일: 본인 이메일
   - 앱 로고: (생략 가능, 출시 전 채우기)
   - 앱 도메인: `https://govgrant-app.vercel.app`
   - 승인된 도메인: `vercel.app`, `supabase.co`
   - 개발자 연락처: 본인 이메일
6. 범위(scopes): 기본값 그대로 (email, profile, openid)
7. 테스트 사용자: 본인 이메일 추가 (정식 검수 전까지)
8. **"API 및 서비스" → "사용자 인증 정보" → "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"**
9. 애플리케이션 유형: **웹 애플리케이션**
10. 이름: `Supabase Auth`
11. **승인된 리디렉션 URI** 두 개 등록:
    - `https://<dev-project-id>.supabase.co/auth/v1/callback`
    - `https://<prod-project-id>.supabase.co/auth/v1/callback`
12. "만들기" → **클라이언트 ID** + **클라이언트 보안 비밀번호** 복사 → 1Password 저장
13. **Supabase 대시보드 → Authentication → Providers → Google** 활성화 → 위 두 값 입력 → Save (dev/prod 각각)

**확인**: Supabase Authentication > Providers에서 Google이 "Enabled" 상태.

---

### 3. 카카오 OAuth 등록 (15분, 가장 복잡)

**단계**:
1. https://developers.kakao.com → "내 애플리케이션" → "애플리케이션 추가하기"
   - 앱 이름: `지원금 찾기`
   - 사업자명: 본인 이름 (개인이면 실명)
   - 카테고리: 서비스
2. 생성된 앱 클릭 → 좌측 메뉴 **"앱 키"**
   - **REST API 키** 복사 → 1Password 저장
3. 좌측 **"플랫폼" → "Web 플랫폼 등록"**
   - 사이트 도메인: `https://govgrant-app.vercel.app`, `http://localhost:3000` (둘 다 추가)
4. 좌측 **"카카오 로그인" → "활성화 설정 ON"**
5. 같은 페이지에서 **Redirect URI** 등록 (Supabase OAuth는 카카오를 표준 OAuth로 받음):
   - `https://<dev-project-id>.supabase.co/auth/v1/callback`
   - `https://<prod-project-id>.supabase.co/auth/v1/callback`
6. **"동의항목"** 메뉴
   - 닉네임: **필수 동의** 체크
   - 카카오계정(이메일): **선택 동의** 체크 (이메일은 OAuth 식별에 필요)
7. **"보안" → "Client Secret"**
   - "코드 생성" 클릭 → 생성된 시크릿 복사 → 1Password 저장
   - 활성화 상태 "사용함"으로 변경
8. **Supabase 대시보드 → Authentication → Providers → Kakao** 활성화
   - **Client ID**: 카카오의 REST API 키 입력
   - **Client Secret**: 위에서 생성한 Client Secret 입력
   - Save (dev/prod 각각)

**확인**: 카카오 개발자 콘솔에서 "사용함" 상태이고, Supabase Authentication > Providers에서 Kakao "Enabled".

**주의사항**: 카카오는 비즈 채널 등록 없이는 일일 사용량 제한이 있음. 출시 전(Phase 8 무렵) 비즈 앱 전환 권장.

---

### 4. Anthropic API Key 발급 (5분)

**단계**:
1. https://console.anthropic.com 접속 → 가입 (Google/이메일)
2. 좌측 **"Plans & Billing"** → 결제 카드 등록 → **$5~10 충전** (시작 단계)
3. **"Settings" → "Limits"** → 월 사용 한도 설정 ($50 권장, 파일럿 단계)
4. **"Settings" → "API Keys" → "Create Key"**
   - 이름: `govgrant-dev`
   - 권한: 전체 (기본값)
   - "Create" → 한 번만 표시되는 키 (`sk-ant-api03-...`) 복사 → 1Password 저장
5. (선택) prod용 별도 키 1개 더 생성 (`govgrant-prod`)

**확인**: Anthropic Console에서 키가 "Active" 상태로 보임.

**팁**:
- 처음 가입 시 무료 크레딧 $5 정도 제공 (Phase 2 테스트용 충분)
- 키는 노출되면 즉시 폐기 후 재생성 가능
- 모델 선택은 환경변수 `LLM_DEFAULT_MODEL_ANTHROPIC=claude-sonnet-4-5`로 설정

---

### 5. OpenAI API Key 발급 (5분)

**단계**:
1. https://platform.openai.com 접속 → 가입
2. **"Settings" → "Billing"** → 결제 카드 등록 → **$5~10 충전**
3. **"Settings" → "Limits"** → Hard limit $30, Soft limit $20 설정
4. **"API Keys" → "+ Create new secret key"**
   - 이름: `govgrant-dev`
   - 권한: All
   - "Create" → 키 (`sk-proj-...`) 복사 → 1Password 저장

**확인**: OpenAI Platform에서 키 표시 + 충전된 잔액 확인.

**팁**: 임베딩 모델은 `text-embedding-3-small` (1536 차원, 매우 저렴) 사용 예정.

---

### 6. Vercel 환경변수 등록 (15분)

**단계**:
1. https://vercel.com → `govgrant-app` 프로젝트 → **Settings → Environment Variables**
2. 위에서 발급받은 키들을 **3개 환경(Production, Preview, Development)** 각각에 등록:

| 변수명 | Production | Preview | Development | 비고 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | prod URL | dev URL | dev만 다름 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon | prod anon | dev anon | |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service | prod service | dev service | ⚠️ 서버 전용 |
| `ANTHROPIC_API_KEY` | prod 키 | prod 키 | dev 키 | |
| `OPENAI_API_KEY` | prod 키 | prod 키 | dev 키 | |
| `LLM_DEFAULT_PROVIDER` | `anthropic` | `anthropic` | `anthropic` | |
| `LLM_FALLBACK_PROVIDER` | `openai` | `openai` | `openai` | |
| `LLM_DEFAULT_MODEL_ANTHROPIC` | `claude-sonnet-4-5` | 동일 | 동일 | |
| `LLM_DEFAULT_MODEL_OPENAI` | `gpt-4o-mini` | 동일 | 동일 | |
| `LLM_MAX_DAILY_COST_USD_PER_USER` | `2.00` | `2.00` | `2.00` | |
| `NEXT_PUBLIC_USE_SUPABASE` | `false` | `false` | `false` | Phase 1에서 true |
| `NEXT_PUBLIC_USE_LLM_CHAT` | `false` | `false` | `false` | Phase 4 |
| `NEXT_PUBLIC_USE_PROPOSAL_AI` | `false` | `false` | `false` | Phase 3 |
| `NEXT_PUBLIC_USE_VECTOR_SEARCH` | `false` | `false` | `false` | Phase 4 |
| `NEXT_PUBLIC_APP_URL` | `https://govgrant-app.vercel.app` | (Preview는 자동) | `http://localhost:3000` | |
| `NEXT_PUBLIC_APP_ENV` | `production` | `preview` | `development` | |

**중요**: `NEXT_PUBLIC_` 접두어 있는 것은 클라이언트 노출 OK(RLS로 보호), 없는 것은 서버 전용. 절대 혼동 금지.

**확인**: Vercel 환경변수 목록에 위 16개가 모두 보임.

**로컬 동기화** (다음 세션에서 실행 예정):
```bash
npm i -g vercel
vercel link  # 프로젝트 연결
vercel env pull .env.local  # Development env를 .env.local로
```

---

### 7. 1Password / Bitwarden 항목 정리 (5분)

권장 보관 항목 (각각 별도 vault item):
- `govgrant-supabase-dev` — URL, anon, service_role, DB password
- `govgrant-supabase-prod` — 동일
- `govgrant-anthropic-dev` — API key, 결제 카드
- `govgrant-anthropic-prod` — (선택)
- `govgrant-openai-dev` — API key, 결제 카드
- `govgrant-google-oauth` — Client ID, Client Secret
- `govgrant-kakao-oauth` — REST API key, Client Secret

---

## 부록 B — 키 발급 후 사용자가 알려줄 정보 (다음 세션 시작 시)

다음 세션 시작할 때 이 형태로 알려주세요 (실제 값 대신 "준비 완료"로):

```
[ ] Supabase dev 프로젝트 생성 + 키 3개 확보
[ ] Supabase prod 프로젝트 생성 + 키 3개 확보
[ ] Google OAuth Client ID/Secret 발급, 두 Supabase callback URL 등록
[ ] 카카오 REST API key/Client Secret 발급, 두 Supabase callback URL 등록
[ ] Supabase Authentication > Providers에 Google/Kakao 둘 다 Enabled
[ ] Anthropic API key 발급, 월 한도 $50 설정
[ ] OpenAI API key 발급, 월 한도 $30 설정
[ ] Vercel env 16개 변수 등록 (Production/Preview/Development)
[ ] 모든 키 1Password 저장 완료
```

위 9개가 모두 ✅이면 Phase 0 → Phase 1 코드 작업을 바로 시작합니다. 만약 일부만 됐어도 가능한 부분부터 시작 가능 (예: Supabase + Anthropic만 있어도 Phase 0 + Phase 2 일부 진행 가능).

---

## Verification (각 Phase 종료 시 공통)

```bash
# 1. 빌드 무결성
cd "C:\Users\인사이터\OneDrive\Desktop\클로드 코드 연결용 폴더\govgrant-app"
rm -rf .next && npm run build

# 2. 타입 체크
npx tsc --noEmit

# 3. 클라이언트 번들에 service_role 누출 검사 (Phase 1 이후)
grep -r "SERVICE_ROLE" .next/static/ || echo "OK: no service_role in client bundle"

# 4. dev 서버 + UI 스모크 (mcp__Claude_Preview)
preview_start govgrant-dev
preview_screenshot
# 핵심 페이지: /, /onboarding, /dashboard, /search, /grants/g001, /chat, /mypage, /proposals (Phase 3+)

# 5. API 직접 호출 검증
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"context":{"kind":"personal","profile":{"birthDate":"1990-01-01","region":"서울"},"interests":["복지"]}}'
```
