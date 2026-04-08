# govgrant-app 진행 상황

> 마지막 업데이트: 2026-04-08
> 마지막 commit: `20e1ab8` (Phase 6 MSIT 어댑터 + 페이지 break 수정)

마스터 플랜은 [`docs/PLAN.md`](./PLAN.md) 참조.

---

## ✅ 완료된 Phase

### Phase 0 — 인프라 준비
- `.env.example`, `docs/SETUP.md`, `docs/ENV.md` 작성
- Supabase dev/prod 프로젝트, Anthropic, OpenAI, Google OAuth 키 발급
- Vercel env 16개 변수 등록 (Production / Preview / Development)
- 카카오 OAuth는 Redirect URI 위치 못 찾아서 **deferred** (Phase 1.5)

### Phase 1 — 인증 & DB 마이그레이션
- Supabase 14개 테이블 + 9개 트리거 + 20+ RLS 정책 (`supabase/migrations/`)
- `src/lib/supabase/{client,server,admin}.ts`
- `src/proxy.ts` (Next.js 16 — middleware 아님)
- `/auth/sign-in`, `/auth/callback`, `/auth/sign-out`
- `useAuth`, `useAccountHydration` 훅
- localStorage → Supabase 자동 이관 (`src/lib/migration/local-to-supabase.ts`)
- Zustand `user-store`에 fire-and-forget Supabase sync 11개 헬퍼
- 검증: 두 브라우저에서 같은 계정 데이터 동기화 확인 ✅

### Phase 2 — LLM 인프라
- `src/lib/llm/` 골격
  - `types.ts` — `LLMProvider`, `LLMMessage`, `LLMResult`, `LLMError`, `DailyLimitExceededError`
  - `cost.ts` — Claude Sonnet 4.5 / gpt-4o-mini 단가 테이블
  - `metering.ts` — `usage_events` 적재
  - `guard.ts` — `canSpend()` 일일 한도
  - `providers/anthropic.ts`, `providers/openai.ts` — `complete()` + `stream()` + (OpenAI) `embed()`
  - `router.ts` — `getLLM()`, fallback 헬퍼
- `/api/llm/complete` 내부 테스트 엔드포인트
- 검증: build 시 `SERVICE_ROLE` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 클라이언트 번들 누출 0건 ✅

### Phase 3 — AI 사업계획서 도우미 ⭐
**백엔드 (commit 937713e)**
- `src/types/proposal.ts` — 7섹션 키, 데이터 모델, SSE 이벤트 타입
- `src/lib/llm/prompts/`
  - `proposal-system.ts` — 한국어 사업계획서 전문가 페르소나 (6원칙)
  - `proposal-user.ts` — 과제 + 지원자 컨텍스트 포매터 (`pastExamples` Phase 4 자리)
  - `proposal-sections.ts` — 7섹션별 상세 지시사항
  - `proposal-refine.ts` — regenerate / refine / shorten / expand 4 모드
- `/api/proposals/route.ts` — POST(create), GET(list)
- `/api/proposals/[id]/route.ts` — GET / PATCH (sections merge + version bump + snapshot) / DELETE
- `/api/proposals/[id]/generate/route.ts` — 7섹션 순차 SSE
- `/api/proposals/[id]/sections/[key]/route.ts` — 단일 섹션 SSE
- `/api/proposals/[id]/versions/route.ts` — 버전 목록

**프론트엔드 (commit 7fcd0f4)**
- `/proposals` 목록 페이지
- `/proposals/new` — 과제 + 컨텍스트 선택 + autostart
- `/proposals/[id]` — 7섹션 에디터 + 미니 목차 + 버전 드로어
- `src/components/proposal/`
  - `proposal-toolbar.tsx`
  - `section-editor.tsx` — 재생성/수정요청/줄이기/늘리기
  - `version-history.tsx`
- `src/hooks/use-proposal-stream.ts` — SSE 파서 + delta 누적 + AbortController
- `/proposals/[id]/download` — Markdown / DOCX (`docx` npm 패키지)
- 과제 상세 페이지에 "AI 사업계획서 초안 만들기" CTA
- 헤더/모바일 네비에 "사업계획서" 메뉴

**버그 수정 (commit da85228)**
- 한글 파일명 ByteString 에러 → ASCII 폴백 + RFC 5987 `filename*=UTF-8''...`
- `Button asChild + disabled` 클릭 swallow → plain `<a target="_blank">`로 교체
- DOCX Buffer → Uint8Array 명시 변환 (Next.js 16 Web Response 호환)
- md/docx 다운로드 try/catch + 에러 메시지 응답

**검증 (사용자 직접)**
- ✅ 로그인 → 과제 선택 → 초안 생성 → 7섹션 스트리밍 (Claude Sonnet 4.5)
- ✅ 한글 파일명 그대로 .docx / .md 다운로드 → 한글/워드 정상 열람

### Production 배포 (2026-04-08)
- ✅ Vercel prod 배포 (govgrant-app.vercel.app)
- ✅ prod Supabase (govgrant-prod, lbmosmubjuzxcdqdbglv) 마이그레이션 적용
- ✅ Google OAuth + Kakao prod 활성화
- ✅ Site URL 수정 (localhost → vercel.app)
- ✅ 사용자 직접 로그인 성공 확인

### Phase 6 MVP (2026-04-08, commits 8fffb82 → ec9bb63 → 20e1ab8)
- ✅ MSIT 사업공고 OpenAPI 어댑터 (`src/lib/data-sources/msit.ts`)
  - 실제 응답 envelope (response 배열, items[].item 이중 wrap) 처리
  - User-Agent 헤더 필수 (없으면 400 차단)
  - viewUrl의 nttSeqNo로 안정적 external_id 생성
- ✅ Grants repository (`src/lib/grants/repository.ts`)
  - `NEXT_PUBLIC_USE_REAL_GRANTS` 플래그로 mock ↔ Supabase 자동 전환
  - 빈 테이블이면 mock 폴백 (안전망)
- ✅ Sync API (`/api/admin/sync-grants`)
  - Bearer 토큰 인증 (`ADMIN_SYNC_TOKEN`)
  - dryRun 모드 + maxPages + console 구조화 로그
- ✅ `/api/grants` 라우트 → repository 사용
- ✅ prod에 100건 적재 완료 (총 4,008건 중)
- ✅ "AI" 검색 → prod에서 21개 정부 R&D 공고 매칭 (검증됨)

**알려진 한계** (Phase 6.5에서 보강):
- MSIT API가 numOfRows 무시하고 항상 10건씩 → 401페이지 필요
- 신청 마감일/금액/자격요건 미수집 → 카드에 D-NaN, "무료/현물 지원" 표시
- 첨부 .hwp/.zip 본문 LLM 파싱으로 보강 가능

---

## 🚧 다음에 할 일 (우선순위 순)

### 옵션 A: Phase 3 사용자 파일럿 (1주, 권장)
- 5명 베타 유저 모집
- 실제 K-Startup / R&D 과제 5건으로 초안 생성 → 평가 (3.5/5 목표)
- 프롬프트 보완 + UX 개선
- **사전 작업 1**: 채팅 노출된 Anthropic 키 폐기 + 새 키로 교체
- **사전 작업 2**: Supabase prod 프로젝트에도 마이그레이션 SQL 적용

### 옵션 B: Vercel Production 배포 (1일)
- prod env 변수 확인
- master push → 자동 배포
- 프로덕션 도메인에서 Phase 0~3 전 흐름 스모크 테스트
- Sentry / PostHog는 Phase 9에서

### 옵션 C: Phase 4 — RAG (3주)
- pgvector 활성화
- `grant_embeddings`, `proposal_examples` 테이블
- mockGrants 우선 임베딩 → RAG 파이프라인 검증
- `proposal-user.ts`의 `pastExamples` 자리에 top-k 사례 주입
- 챗봇 (`/api/chat`) RAG로 교체

### 알려진 빚 (Phase 4~7에서 갚음)
- 카카오 OAuth Redirect URI 위치 (Phase 1.5)
- DOCX 표/인용/코드블록 미지원 (Phase 3.5 또는 후순위)
- 버전 diff 비교 UI 없음 (Phase 7 B2B 단계 후보)
- mockGrants → 실데이터 (Phase 6)
- "전체 생성" 시 unsaved 편집 confirm 다이얼로그 (소소한 UX)

---

## 💻 집에서 이어 작업하기

### 첫 1회 setup
```powershell
cd ~\Desktop
git clone https://github.com/ydae7545-commits/govgrant-app.git
cd govgrant-app
npm install
npm i -g vercel
vercel link  # ydae7545's projects → govgrant-app 선택
vercel env pull .env.local  # 모든 env 자동 다운로드
npm run dev
```

### 매번 작업 시작
```powershell
cd path\to\govgrant-app
git pull
vercel env pull .env.local  # env 변경 가능성 대비
npm run dev
```

### 매번 작업 끝
```powershell
git add -A
git commit -m "메시지"
git push
```

### 집/회사 양쪽에서 dev 동시 실행 시 주의
- 같은 Supabase dev 프로젝트를 공유하므로 데이터는 같음 (장점)
- 동시에 user 테이블 row 변경하면 충돌 가능 (실제로는 거의 없음)
- prod 마이그레이션은 한쪽에서만 한 번에 실행

---

## 🔐 보안 체크리스트
- [ ] 채팅에 노출된 Anthropic 키 (`...vcKcvwAA`) revoke + 새 키 발급
- [ ] 새 키는 본인이 직접 `.env.local`에 붙여넣기 (대화에 노출 금지)
- [ ] `.env.local`은 절대 git에 커밋되지 않는지 `.gitignore` 확인
- [ ] Vercel env에 등록된 키들 1Password 백업
- [ ] Supabase service_role 키가 클라이언트 번들에 없는지 매 빌드마다 grep

---

## 📊 비용 현황 (검증 시점)
- Anthropic: $5 충전, $0.5~1 사용 추정 → 잔액 약 $4
- OpenAI: $0 (key는 있지만 충전 안 함)
- Supabase: dev/prod 둘 다 Free tier
- Vercel: Hobby 무료
- **월 고정비**: $0
- **예상 변동비** (Phase 5 출시 후): Anthropic $20~50, Resend $0 (3000건/월 무료), Supabase $0~25
