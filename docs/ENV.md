# Environment Variables Reference

이 문서는 `govgrant-app`에서 사용하는 모든 환경변수의 **용도·런타임 위치·노출 가능 여부·사용 Phase**를 정리합니다. 변수 추가/삭제 시 이 표도 함께 업데이트해주세요.

환경변수 실제 값은 **Vercel 대시보드**에 등록되어 있으며, 로컬 개발 시 `.env.local` 로 내려받습니다 (`vercel env pull`). 템플릿은 [`.env.example`](../.env.example) 참고, 최초 발급 절차는 [`docs/SETUP.md`](./SETUP.md) 참고.

---

## 🔑 보안 원칙 (반드시 지켜주세요)

1. **`NEXT_PUBLIC_` 접두어 규칙**
   - `NEXT_PUBLIC_` 으로 시작하면 클라이언트 번들에 포함됨 → 브라우저에서 누구나 볼 수 있음 → **공개해도 무방한 값만**
   - 접두어 없으면 서버 사이드에서만 접근 가능 → API Routes, Server Components, Server Actions, Edge Functions에서만 사용
2. **서버 전용 키는 절대 `NEXT_PUBLIC_` 금지**
   - `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` 등은 클라이언트에 노출되면 **무제한 API 호출 비용 폭탄, 전체 DB 접근** 위험
3. **서버 전용 모듈에 `import "server-only"` 선언**
   - `src/lib/llm/`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts` 등은 파일 최상단에 `import "server-only"` 넣어서 클라이언트 번들 진입을 컴파일 타임에 차단
4. **로컬 `.env.local` 파일은 커밋 금지**
   - `.gitignore`에 이미 제외되어 있지만, 이름 바꾸거나 다른 경로로 실수 커밋하지 않도록 주의
5. **키 노출 시 즉시 회전**
   - 실수로 Git, 채팅, 로그 등에 키가 노출되면 **즉시 해당 서비스 콘솔에서 Revoke/Reset**

---

## 📋 전체 변수 일람

### 🟦 Supabase (환경별 다른 값)

| 변수명 | 런타임 | 노출 가능? | 용도 | Phase | 발급처 |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 클라 + 서버 | 🟢 네 | Supabase 프로젝트 엔드포인트. dev / prod 서로 다름. | 1+ | Supabase Dashboard → Data API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라 + 서버 | 🟢 네 | 클라이언트 인증용 JWT. RLS 정책에 의해 접근 권한이 제한됨. | 1+ | Supabase Dashboard → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용** | 🔴 **절대 금지** | RLS 우회. 모든 테이블 R/W. 마이그레이션, 배치 작업, 사용량 기록에 사용. | 1+ | Supabase Dashboard → API Keys (Reveal) |

**환경별 값 분리**:
- `Production` + `Preview`: **prod** 프로젝트 값
- `Development`: **dev** 프로젝트 값

**사용 위치 예시**:
- `src/lib/supabase/client.ts` — 브라우저 클라이언트 (`createBrowserClient`)
- `src/lib/supabase/server.ts` — 서버 컴포넌트/Route Handler (`createServerClient` + `await cookies()`)
- `src/lib/supabase/admin.ts` — service_role 전용 (`createClient`, `persistSession: false`)

---

### 🟩 LLM Providers (모든 환경 동일)

| 변수명 | 런타임 | 노출 가능? | 용도 | Phase | 발급처 |
|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | **서버 전용** | 🔴 **절대 금지** | Claude API 호출 (주력 LLM). Phase 3 사업계획서 생성, Phase 4 RAG 챗봇. | 2+ | <https://console.anthropic.com> → API Keys |
| `OPENAI_API_KEY` | **서버 전용** | 🔴 **절대 금지** | OpenAI API 호출 (임베딩 + Claude 폴백). Phase 4 임베딩에 필수. | 2+ | <https://platform.openai.com> → API keys |
| `LLM_DEFAULT_PROVIDER` | 서버 전용 | 🟡 기술적으로 가능하지만 권장 안 함 | 기본 LLM 제공자 (`anthropic` / `openai`). 라우팅 로직에 사용. | 2+ | 고정값: `anthropic` |
| `LLM_FALLBACK_PROVIDER` | 서버 전용 | 🟡 | 기본 제공자 실패 시 폴백할 제공자. | 2+ | 고정값: `openai` |
| `LLM_DEFAULT_MODEL_ANTHROPIC` | 서버 전용 | 🟡 | Anthropic 기본 모델명. 예: `claude-sonnet-4-5`. 모델 업그레이드 시 값만 교체. | 2+ | 고정값 |
| `LLM_DEFAULT_MODEL_OPENAI` | 서버 전용 | 🟡 | OpenAI 기본 모델명. 예: `gpt-4o-mini`. 임베딩은 별도 모델명 사용. | 2+ | 고정값 |
| `LLM_MAX_DAILY_COST_USD_PER_USER` | 서버 전용 | 🟡 | 사용자당 일일 LLM 비용 상한 (USD). `src/lib/llm/guard.ts`에서 `usage_events` 합계와 비교하여 429 반환. | 2+ | 고정값: `2.00` (파일럿 단계) |

**모델 선택 팁**:
- Claude Sonnet 4.5: 사업계획서 같은 긴 생성 작업에 품질 우수, 비용 중간
- GPT-4o-mini: 빠르고 저렴, 폴백용으로 적합
- `text-embedding-3-small` (OpenAI): 임베딩. 1536 차원, 매우 저렴 ($0.02/1M tokens)

---

### 🟨 Feature Flags (모든 환경 동일, 점진 활성화)

| 변수명 | 런타임 | 노출 가능? | 용도 | Phase | 초기값 |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_USE_SUPABASE` | 클라 + 서버 | 🟢 네 | Supabase 인증/DB 활성화. `false`이면 기존 Zustand localStorage 경로 유지 → 즉시 롤백 가능. | 1 | `false` |
| `NEXT_PUBLIC_USE_LLM_CHAT` | 클라 + 서버 | 🟢 네 | 챗봇을 키워드 매칭에서 LLM+RAG로 전환. | 4 | `false` |
| `NEXT_PUBLIC_USE_PROPOSAL_AI` | 클라 + 서버 | 🟢 네 | AI 사업계획서 도우미 UI + API 활성화. 과제 상세 페이지의 "초안 만들기" 버튼 표시 여부. | 3 | `false` |
| `NEXT_PUBLIC_USE_VECTOR_SEARCH` | 클라 + 서버 | 🟢 네 | 검색/추천에 임베딩 의미 검색 활성화. 비활성 시 키워드 + 규칙 기반 매칭만 사용. | 4 | `false` |

**왜 `NEXT_PUBLIC_` 인가**: UI에서 기능을 표시/숨김 처리하려면 클라이언트에서도 분기 판단이 필요하기 때문. 서버에서도 동일 값 접근 가능.

**Phase별 활성화 순서**:
- Phase 1 완료 → `NEXT_PUBLIC_USE_SUPABASE=true`
- Phase 3 완료 → `NEXT_PUBLIC_USE_PROPOSAL_AI=true`
- Phase 4 완료 → `NEXT_PUBLIC_USE_LLM_CHAT=true`, `NEXT_PUBLIC_USE_VECTOR_SEARCH=true`

---

### 🟪 App Meta (환경별 다른 값)

| 변수명 | 런타임 | 노출 가능? | 용도 | Phase | 값 |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 클라 + 서버 | 🟢 네 | 앱의 절대 URL 기준점. OAuth 콜백, 이메일 링크 생성, 절대 링크 표기 등에 사용. | 1+ | Prod/Preview: `https://govgrant-app.vercel.app`<br>Dev: `http://localhost:3000` |
| `NEXT_PUBLIC_APP_ENV` | 클라 + 서버 | 🟢 네 | 런타임 환경 구분. 분석 이벤트 태깅, 배지 표시, 로그 레벨 등에 사용. | 1+ | `production` / `preview` / `development` |

---

### 🟥 Phase 5+ 플레이스홀더 (아직 사용 안 함)

| 변수명 | 런타임 | 노출 가능? | 용도 | Phase | 상태 |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | **서버 전용** | 🔴 **절대 금지** | 이메일 발송 (마감 알림, 신규 맞춤 과제). React Email 템플릿과 연동. | 5 | 빈 값 OK (Phase 5에서 실제 발급) |
| `SENTRY_DSN` | **서버 전용** | 🔴 금지 (DSN 형식) | 에러 추적. 서버/클라 공통 초기화. | 9 | 빈 값 OK |
| `NEXT_PUBLIC_POSTHOG_KEY` | 클라 + 서버 | 🟢 네 (public 키) | 사용자 행동 분석, 퍼널. 클라이언트 이벤트 전송. | 9 | 빈 값 OK |

**참고**: Sentry DSN은 프로젝트 구분용이지만 secret은 아닙니다. 그래도 외부 에러 보고 엔드포인트이므로 이 문서에서는 "서버 전용" 분류. PostHog는 public 키 / private 키 개념이 분리되어 있어 `NEXT_PUBLIC_POSTHOG_KEY`는 공개 키입니다.

---

## 🛠️ 신규 변수 추가 절차

새로운 외부 서비스나 feature flag가 필요할 때:

1. **네이밍 규칙 결정**
   - 클라이언트 필요? → `NEXT_PUBLIC_` 접두어
   - 서버 전용? → 접두어 없이
2. **`.env.example` 업데이트**
   - 그룹화하여 주석과 함께 추가
3. **이 문서(`docs/ENV.md`) 표에 추가**
   - 용도, Phase, 노출 가능 여부 명시
4. **Vercel 환경변수 등록**
   - 해당 환경(Production/Preview/Development)에 추가
5. **로컬 `.env.local` 업데이트**
   - `vercel env pull .env.local` 로 재동기화 또는 수동 편집
6. **사용 코드 작성**
   - 서버 전용이면 `import "server-only"` 있는 모듈에서만 참조
   - 타입 안전을 위해 `src/lib/env.ts` 같은 헬퍼에서 `process.env.X!` 검증 패턴 권장 (Phase 2에 구축 예정)

---

## 🔍 디버깅: 변수가 적용되지 않을 때

### 로컬 개발 (`npm run dev`)

- `.env.local` 파일 존재 확인: `ls -la | grep env`
- 변수 값 확인: `echo $NEXT_PUBLIC_SUPABASE_URL` (Windows: `echo %NEXT_PUBLIC_SUPABASE_URL%`)
- Next.js 서버 재시작 필수: `.env.local` 변경 시 dev 서버를 껐다 켜야 반영
- 오타 점검: 접두어, 대소문자, 언더스코어

### Vercel 배포

- Deployments 탭 → 해당 배포 → **Build Logs** → 환경변수 로딩 에러 검색
- Environment Variables 페이지에서 해당 환경(Production/Preview/Development)에 변수가 보이는지 확인
- **재배포 필요**: 환경변수 변경은 자동 재빌드되지 않음. `vercel --prod` 또는 Dashboard에서 "Redeploy" 클릭

### 클라이언트에서 값이 `undefined`

- `NEXT_PUBLIC_` 접두어가 **빠져있으면** 클라이언트 번들에 포함되지 않음 → `undefined`
- 접두어 추가 → 재빌드 → 재배포

### 서버에서 값이 `undefined`

- Vercel env에 해당 환경(Development 등)이 체크되어 있는지 확인
- API Route 또는 Server Component에서만 접근 가능. Client Component에서 접근 시 컴파일 에러 또는 `undefined`

---

## 📚 참고 링크

- [Next.js - Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Vercel - Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Supabase - Authentication](https://supabase.com/docs/guides/auth)
- [Anthropic - API Reference](https://docs.anthropic.com/en/api/getting-started)
- [OpenAI - API Reference](https://platform.openai.com/docs/api-reference)
