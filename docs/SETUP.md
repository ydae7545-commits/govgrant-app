# Setup Guide — Phase 0 인프라 준비

이 문서는 **govgrant-app을 상용화 수준으로 끌어올리기 위한 Phase 0 (인프라 준비)** 단계를 처음부터 끝까지 따라 할 수 있도록 작성된 가이드입니다. 외부 서비스 6개(Supabase × 2, Google Cloud, Kakao, Anthropic, OpenAI) 계정 생성과 키 발급, 그리고 Vercel 환경변수 등록까지 다룹니다.

> **대상 독자**: 프로젝트를 처음 세팅하는 개발자 또는 다른 PC에서 이어받는 기존 개발자.
> **소요 시간**: 처음이면 90분~2시간. 경험자면 40분.
> **사전 준비**: 신용카드(Anthropic/OpenAI 결제용), 본인 인증 휴대폰, GitHub 계정, Vercel 계정.
> **결과물**: 6개 외부 서비스 계정 + 키 8세트 + Vercel 환경변수 16개가 모두 등록된 상태.

---

## 목차

1. [Supabase 프로젝트 생성 (dev / prod)](#1-supabase-프로젝트-생성)
2. [Google OAuth 등록 + Supabase 연결](#2-google-oauth-등록--supabase-연결)
3. [Kakao OAuth 등록 + Supabase 연결](#3-kakao-oauth-등록--supabase-연결)
4. [Anthropic API Key 발급](#4-anthropic-api-key-발급)
5. [OpenAI API Key 발급](#5-openai-api-key-발급)
6. [Vercel 환경변수 등록](#6-vercel-환경변수-등록)
7. [로컬 개발 환경 초기화](#7-로컬-개발-환경-초기화)
8. [트러블슈팅](#8-트러블슈팅)

---

## 1. Supabase 프로젝트 생성

**왜 먼저 하는가**: 다른 OAuth(Google / Kakao) 등록 시 Supabase의 콜백 URL이 필요합니다. 따라서 이것을 가장 먼저 만들어야 합니다.

### 1-1. 계정 생성 및 프로젝트 2개 만들기

1. <https://supabase.com> 접속 → **"Start your project"** → GitHub 계정으로 가입
2. 새 organization 생성 (이름: 본인 이름 또는 회사명)
3. **`govgrant-dev` 프로젝트 생성**
   - Project name: `govgrant-dev`
   - Database password: **강력한 패스워드** 생성 후 안전하게 저장 (재발급 시 번거로움)
   - Region: **Northeast Asia (Seoul)** — `ap-northeast-2` 필수 (한국 사용자 지연 최소화)
   - Pricing plan: **Free** (Phase 1~3 동안 충분)
   - "Create new project" 클릭 → 약 2분 대기
4. **`govgrant-prod` 프로젝트 생성** (위와 동일, 이름만 다름)
   - 처음에는 Free로 시작
   - Phase 5 출시 무렵 Pro($25/월) 업그레이드 권장 (PITR + 감사 로그)

### 1-2. 각 프로젝트의 키 8개 확보

Supabase 대시보드의 새 UI에서는 메뉴가 분리되어 있습니다.

**Project URL 위치**: `Integrations → Data API` 메뉴 또는 직접 URL:
```
https://supabase.com/dashboard/project/<PROJECT_ID>/integrations/data-api
```

**API Keys 위치**: `Project Settings → API Keys` 또는 직접 URL:
```
https://supabase.com/dashboard/project/<PROJECT_ID>/settings/api-keys
```

**Database Password 재설정 위치**: `Project Settings → Database` 또는:
```
https://supabase.com/dashboard/project/<PROJECT_ID>/settings/database
```

각 프로젝트(dev / prod)에서 다음 4개 값을 확보하세요:

| 키 | 위치 | 용도 | 노출 가능? |
|---|---|---|---|
| **Project URL** | Data API 페이지 | Supabase 엔드포인트 | 네 (NEXT_PUBLIC_) |
| **anon public key** | API Keys 페이지 | 클라이언트 인증, RLS로 보호 | 네 (NEXT_PUBLIC_) |
| **service_role secret key** | API Keys 페이지 → Reveal | 서버 전용, RLS 우회 가능 | **절대 금지** |
| **Database password** | Database 페이지 | 직접 DB 접속 / 마이그레이션 | 절대 금지 |

### 1-3. 비밀번호 관리 도구에 저장

권장 저장 항목 (각각 별도 vault item):
- `govgrant-supabase-dev` — URL, anon, service_role, DB password
- `govgrant-supabase-prod` — 동일한 4개

비밀번호 관리 도구로는 **Bitwarden (무료)** 또는 **1Password (유료)** 를 권장합니다. 도구가 없다면 로컬 메모장이라도 **절대 `govgrant-app` 폴더 밖**에 저장해야 합니다 (GitHub 노출 방지).

### ✅ 완료 확인

- [ ] Supabase 대시보드에 `govgrant-dev`, `govgrant-prod` 두 프로젝트가 "Healthy" 상태로 보임
- [ ] 두 프로젝트 모두 Region이 `ap-northeast-2`
- [ ] 키 8개 (URL·anon·service_role·DB password × 2세트) 모두 안전한 곳에 저장됨

---

## 2. Google OAuth 등록 + Supabase 연결

### 2-1. Google Cloud Console 프로젝트 생성

1. <https://console.cloud.google.com> 접속 → Google 계정 로그인
2. 상단 드롭다운 → **새 프로젝트** 클릭
   - 프로젝트 이름: `govgrant`
3. 프로젝트 선택 후 좌측 메뉴 → **"API 및 서비스" → "OAuth 동의 화면"**
4. **External** 선택 → "만들기"
5. 앱 정보 입력:
   - 앱 이름: `지원금 찾기`
   - 사용자 지원 이메일: 본인 이메일
   - 앱 도메인: `https://govgrant-app.vercel.app`
   - 승인된 도메인: `vercel.app`, `supabase.co`
   - 개발자 연락처: 본인 이메일
6. 범위(scopes): 기본값 그대로 (`email`, `profile`, `openid`)
7. 테스트 사용자: 본인 이메일 추가 (정식 검수 전까지)

### 2-2. OAuth 2.0 클라이언트 ID 생성

1. **"API 및 서비스" → "사용자 인증 정보" → "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"**
2. 애플리케이션 유형: **웹 애플리케이션**
3. 이름: `Supabase Auth`
4. **승인된 리디렉션 URI** 두 개 등록 (dev + prod):
   ```
   https://<dev-project-id>.supabase.co/auth/v1/callback
   https://<prod-project-id>.supabase.co/auth/v1/callback
   ```
   > `<project-id>` 부분은 1단계에서 확보한 각 Supabase 프로젝트의 실제 서브도메인으로 교체하세요.
5. "만들기" → **클라이언트 ID** + **클라이언트 보안 비밀번호** 복사 후 안전하게 저장
   - Secret이 팝업에 안 보이면 나중에 OAuth 클라이언트 상세 페이지에서 확인 가능 (Google은 재확인 허용)

### 2-3. Supabase에 Google Provider 연결

dev / prod 각각에서 반복:

1. Supabase 대시보드 → 해당 프로젝트 → **Authentication → Providers**
2. **Google** 찾아서 클릭
3. 다음을 설정:
   - **Enable Sign in with Google**: 토글 **ON**
   - **Client IDs**: 2-2에서 복사한 Client ID
   - **Client Secret (for OAuth)**: 2-2에서 복사한 Secret
   - **Skip nonce checks**: OFF (기본값)
   - **Allow users without an email**: OFF (기본값)
4. **Save** → Providers 목록에서 Google이 "Enabled" 로 바뀌는지 확인

### ✅ 완료 확인

- [ ] Google Cloud Console에 `govgrant` 프로젝트 + OAuth 2.0 클라이언트 ID 존재
- [ ] 승인된 리디렉션 URI 2개 등록됨 (dev + prod)
- [ ] Supabase dev + prod의 Authentication > Providers에서 Google이 **Enabled** 표시

---

## 3. Kakao OAuth 등록 + Supabase 연결

> **주의**: 카카오 개발자 콘솔 UI가 자주 개편됩니다. 이 문서의 메뉴 위치가 실제와 다를 수 있으니, 공식 문서를 병행 참고하세요: <https://developers.kakao.com/docs/latest/ko/kakaologin/prerequisite>
>
> Phase 1 검증 단계에서 Redirect URI 등록 시 문제가 생기면 공식 문서 기준으로 재조정합니다.

### 3-1. 카카오 개발자 계정 + 애플리케이션 생성

1. <https://developers.kakao.com> 접속 → 카카오 계정으로 로그인
2. 약관 동의 (개발자 서비스 이용약관 + 개인정보 + 14세 이상 확인)
3. **"내 애플리케이션" → "애플리케이션 추가하기"**
4. 앱 정보 입력:
   - 앱 이름: `지원금 찾기`
   - 사업자명: 본인 실명 (개인) 또는 사업자명
   - 카테고리: `서비스`
5. 저장

### 3-2. REST API 키 + Client Secret 확보

**REST API 키**:
- 좌측 사이드바 **"앱 설정 → 앱 → 플랫폼 키"** (또는 직접 URL: `/console/app/<APP_ID>/config/appKey`)
- **Default Rest API Key** 카드에서 값 복사
- 저장 라벨: `KAKAO_REST_API_KEY` (Supabase에서는 이 값을 "Client ID"로 사용)

**Client Secret**:
- 같은 카드 아래 **"클라이언트 시크릿"** 버튼 클릭
- **카카오 로그인** 섹션에서 **"코드 생성"** → 생성된 값 복사
- 활성화 상태를 반드시 **"사용함"** 으로 변경 후 저장

### 3-3. 카카오 로그인 활성화 + Redirect URI + 동의항목

1. 좌측 사이드바 **"제품 설정 → 카카오 로그인 → 일반"**
2. **사용 설정** 토글 **ON**
3. **OpenID Connect** 토글 **ON** (Supabase OAuth와 호환성)
4. **Redirect URI** 등록:
   > 2025년 이후 UI에서 이 섹션의 위치가 자주 바뀝니다. `카카오 로그인 → 고급`, `카카오 로그인 → 일반` 하단, 또는 별도 탭으로 분리되어 있을 수 있습니다. 찾을 수 없으면 공식 문서 확인.
   ```
   https://<dev-project-id>.supabase.co/auth/v1/callback
   https://<prod-project-id>.supabase.co/auth/v1/callback
   ```
5. **동의항목** (좌측 사이드바 → "동의항목"):
   - **닉네임**: 필수 동의 ✅
   - **카카오계정(이메일)**: 선택 동의 (비즈 앱 전환 전까지는 필수 불가)
   - 그 외 항목(프로필 사진, 성별, 연령 등): 모두 **동의 안 함** 유지 (개인정보 최소 수집)

### 3-4. Supabase에 Kakao Provider 연결

dev / prod 각각:

1. Supabase 대시보드 → 해당 프로젝트 → **Authentication → Providers**
2. **Kakao** 찾아서 클릭
3. 다음을 설정:
   - **Enable Sign in with Kakao**: 토글 **ON**
   - **Client ID (for OAuth)**: 3-2의 **REST API 키** (Client Secret 아님, Rest API 키!)
   - **Client Secret**: 3-2의 Client Secret
4. **Save** → Providers 목록에서 Kakao가 "Enabled" 로 바뀌는지 확인

### ✅ 완료 확인

- [ ] 카카오 개발자 콘솔에 `지원금 찾기` 앱 존재
- [ ] 카카오 로그인 사용 설정 ON, OpenID Connect ON
- [ ] Redirect URI 2개 등록됨
- [ ] 동의항목: 닉네임 필수 동의
- [ ] Supabase dev + prod의 Providers에서 Kakao가 **Enabled**

---

## 4. Anthropic API Key 발급

Phase 3(AI 사업계획서 도우미)와 Phase 4(RAG 챗봇)에서 사용하는 주력 LLM입니다.

1. <https://console.anthropic.com> 접속 → Google 계정 또는 이메일로 가입
2. 조직 생성 (이름: `govgrant`, 용도: "Building" 또는 "Developer")
3. **Plans & Billing** → 결제 카드 등록 → **$5~10 충전** (선불 크레딧 방식)
   > Anthropic은 후불이 아닌 선불 크레딧 방식입니다. 충전한 금액만큼만 API 호출 가능.
4. **Settings → Limits** → 월 사용 한도 설정:
   - **Hard limit**: $50 (자동 차단)
   - **Soft limit**: $30 (이메일 경고)
5. **Settings → API Keys → Create Key**:
   - 이름: `govgrant-dev`
   - 권한: All (기본값)
   - Create 직후 표시되는 키 (`sk-ant-api03-...`) 즉시 복사
   > **중요**: 이 키는 팝업이 닫히면 다시 볼 수 없습니다. 재생성만 가능.

### ✅ 완료 확인

- [ ] Anthropic 계정 + 결제 카드 등록
- [ ] $5~10 크레딧 충전
- [ ] 월 한도 $50 설정
- [ ] API Key 발급 후 안전하게 저장

---

## 5. OpenAI API Key 발급

Phase 4 임베딩(`text-embedding-3-small`)과 LLM 폴백에 사용합니다.

1. <https://platform.openai.com> 접속 (주의: `chat.openai.com`이 아닌 `platform.openai.com`)
2. 가입 (ChatGPT 계정 있으면 재사용 가능) + 전화번호 인증 (SMS)
3. **Settings → Billing** → 결제 카드 등록 → **$5~10 충전**
   > Auto recharge는 **OFF 권장** (비용 폭주 방지)
4. **Settings → Limits** → Monthly budget:
   - **Hard limit**: $30
   - **Soft limit**: $20
5. **API keys → + Create new secret key**:
   - 이름: `govgrant-dev`
   - 권한: All (기본값)
   - 발급된 키 (`sk-proj-...`) 즉시 복사

### ✅ 완료 확인

- [ ] OpenAI Platform 계정 + 전화 인증
- [ ] 결제 카드 등록 + $5~10 충전
- [ ] Auto recharge OFF
- [ ] Monthly hard limit $30
- [ ] API Key 발급 후 안전하게 저장

---

## 6. Vercel 환경변수 등록

지금까지 확보한 모든 키를 Vercel의 3개 환경(Production / Preview / Development)에 등록합니다.

### 6-1. Environment Variables 페이지 접속

1. <https://vercel.com/dashboard> → `govgrant-app` 프로젝트 선택
2. 상단 탭 **Settings → Environment Variables**

### 6-2. 배치 방식으로 16개 변수 등록

한꺼번에 등록하려고 하면 헷갈리므로 **3개 배치**로 나눕니다. Vercel의 `.env` 자동 파싱 기능을 활용해 여러 줄을 한 번에 붙여넣을 수 있습니다.

#### 배치 1: 모든 환경에 동일한 11개

**Environments**: All Environments (기본값 유지)

**Key 입력칸에 붙여넣기** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` 값만 실제 값으로 교체):

```
ANTHROPIC_API_KEY=<Anthropic 키>
OPENAI_API_KEY=<OpenAI 키>
LLM_DEFAULT_PROVIDER=anthropic
LLM_FALLBACK_PROVIDER=openai
LLM_DEFAULT_MODEL_ANTHROPIC=claude-sonnet-4-5
LLM_DEFAULT_MODEL_OPENAI=gpt-4o-mini
LLM_MAX_DAILY_COST_USD_PER_USER=2.00
NEXT_PUBLIC_USE_SUPABASE=false
NEXT_PUBLIC_USE_LLM_CHAT=false
NEXT_PUBLIC_USE_PROPOSAL_AI=false
NEXT_PUBLIC_USE_VECTOR_SEARCH=false
```

Save 클릭 → 11개가 한 번에 등록됨.

#### 배치 2: Production + Preview용 Supabase 5개

**"Add New" 클릭** → **Environments**: Production + Preview만 체크 (Development 해제)

**Key 입력칸에 붙여넣기**:

```
NEXT_PUBLIC_SUPABASE_URL=<prod URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod ANON KEY>
SUPABASE_SERVICE_ROLE_KEY=<prod SERVICE ROLE KEY>
NEXT_PUBLIC_APP_URL=https://govgrant-app.vercel.app
NEXT_PUBLIC_APP_ENV=production
```

> 선택사항: **Sensitive 토글 ON** 으로 저장하면 `SUPABASE_SERVICE_ROLE_KEY`가 마스킹되어 다시 볼 수 없게 됩니다 (보안 강화). Production + Preview에서만 Sensitive 사용 가능.

Save 클릭.

#### 배치 3: Development용 Supabase 5개

**"Add New" 클릭** → **Environments**: Development만 체크

**Key 입력칸에 붙여넣기**:

```
NEXT_PUBLIC_SUPABASE_URL=<dev URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev ANON KEY>
SUPABASE_SERVICE_ROLE_KEY=<dev SERVICE ROLE KEY>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development
```

> Development 환경은 Sensitive 설정 불가. 토글 OFF 유지.

Save 클릭.

### 6-3. 완료 확인

Environment Variables 목록에 다음이 모두 보여야 합니다 (총 21개 항목 — 16개 논리 변수, 환경별 분리로 중복 표시):

| 변수명 | 등록된 환경 |
|---|---|
| ANTHROPIC_API_KEY | All |
| OPENAI_API_KEY | All |
| LLM_DEFAULT_PROVIDER | All |
| LLM_FALLBACK_PROVIDER | All |
| LLM_DEFAULT_MODEL_ANTHROPIC | All |
| LLM_DEFAULT_MODEL_OPENAI | All |
| LLM_MAX_DAILY_COST_USD_PER_USER | All |
| NEXT_PUBLIC_USE_SUPABASE | All |
| NEXT_PUBLIC_USE_LLM_CHAT | All |
| NEXT_PUBLIC_USE_PROPOSAL_AI | All |
| NEXT_PUBLIC_USE_VECTOR_SEARCH | All |
| NEXT_PUBLIC_SUPABASE_URL | Production/Preview + Development (2개 행) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Production/Preview + Development |
| SUPABASE_SERVICE_ROLE_KEY | Production/Preview + Development |
| NEXT_PUBLIC_APP_URL | Production/Preview + Development |
| NEXT_PUBLIC_APP_ENV | Production/Preview + Development |

### ✅ 완료 확인

- [ ] Vercel Environment Variables에 최소 16개 논리 변수 등록
- [ ] Supabase 관련 5개와 App 관련 2개는 Production/Preview와 Development가 서로 다른 값
- [ ] 그 외 11개는 "All Environments"

---

## 7. 로컬 개발 환경 초기화

Phase 0 이후 코드 작업 시 로컬에서 개발 서버를 돌리려면 `.env.local` 파일이 필요합니다.

### 7-1. Vercel CLI 설치 (최초 1회)

```bash
npm i -g vercel
```

### 7-2. 프로젝트 연결 (최초 1회)

```bash
cd govgrant-app
vercel login
vercel link
# 프롬프트:
#   ? Set up "...govgrant-app"? [Y/n] y
#   ? Which scope? <본인 계정 선택>
#   ? Link to existing project? [Y/n] y
#   ? What's the name of your existing project? govgrant-app
```

### 7-3. 환경변수 가져오기

```bash
vercel env pull .env.local
```

이 명령은 Vercel의 **Development 환경** 변수를 `.env.local`로 다운로드합니다. 이 파일은 `.gitignore`에 의해 자동 제외됩니다.

### 7-4. 개발 서버 실행

```bash
npm install
npm run dev
```

<http://localhost:3000> 에서 정상 동작하면 성공.

### ✅ 완료 확인

- [ ] `vercel link` 성공
- [ ] `.env.local` 파일이 `govgrant-app/` 루트에 존재하고 16개 변수 포함
- [ ] `npm run dev` 정상 실행, 기존 앱 동일 동작

---

## 8. 트러블슈팅

### Q1. Anthropic/OpenAI 결제 카드 등록이 거부됩니다

- 해외결제 차단된 카드일 수 있음. 은행에 "해외결제 허용" 요청하거나 다른 카드 시도.
- Visa/MasterCard 체크카드도 대부분 OK.

### Q2. 카카오 Redirect URI 섹션을 찾을 수 없습니다

카카오 개발자 콘솔 UI가 자주 개편되어 메뉴 위치가 바뀝니다:
- 공식 문서 참고: <https://developers.kakao.com/docs/latest/ko/kakaologin/prerequisite>
- 또는 카카오 로그인이 동작하지 않아도 Google OAuth만으로 Phase 1 개발 진행 가능. 카카오는 Phase 1 검증 단계에서 재도전.

### Q3. Supabase에서 "Auth hook" 등 최근 개편 메뉴가 보입니다

기본 OAuth에는 Auth hook 사용 안 함. 무시해도 됨.

### Q4. Vercel 환경변수 배치 붙여넣기가 자동 파싱되지 않습니다

일부 Vercel UI 버전은 자동 파싱 미지원. 이 경우 **"+ Add Another"** 버튼으로 하나씩 등록.

### Q5. Vercel CLI가 `vercel link` 중에 "Scope" 선택에서 막힙니다

- `vercel login` 을 먼저 실행하여 올바른 계정으로 로그인했는지 확인
- 본인 계정(personal)이 아닌 팀(team)에 속해 있으면 해당 팀 선택

### Q6. `.env.local`을 pull 했는데 변수가 비어 있습니다

- Vercel 대시보드의 **Development 환경**에 해당 변수가 등록되어 있는지 확인
- `vercel env pull --environment=development .env.local` 로 환경 명시

### Q7. 키 값을 실수로 커밋/푸시했습니다

**즉시 회전 필수**:
- Supabase: Settings → API → Reset keys 또는 JWT Secret Rotate
- Anthropic / OpenAI: Console에서 해당 키 Revoke → 새 키 생성
- Google / Kakao OAuth: Client Secret 재생성
- 히스토리에서 제거: `git rebase -i` 또는 `git filter-repo` (복잡한 경우 신규 레포 고려)

### Q8. 일부 키만 발급했을 때 개발 시작 가능한가요?

- **Supabase dev + Anthropic key**만 있어도 Phase 0 + Phase 2 일부 작업 가능
- **Google OAuth만** 있어도 Phase 1 인증 작업 진행 가능 (Kakao는 나중에 추가)
- 모든 키가 없더라도 feature flag가 모두 `false` 이므로 기존 mock 동작은 그대로

---

## 다음 단계

Phase 0이 완료되면 개발자는 다음 순서로 진행합니다:

- **Phase 1**: Supabase 스키마 마이그레이션, 인증 흐름, localStorage → Supabase 이관 (2~3주)
- **Phase 2**: LLM Provider 어댑터 (`src/lib/llm/`), 사용량 미터링, 가드 (1주)
- **Phase 3 ⭐**: AI 사업계획서 도우미 MVP — 핵심 차별화 기능 (3주)

전체 로드맵은 `.claude/plans/bubbly-forging-newt.md` 참고.
