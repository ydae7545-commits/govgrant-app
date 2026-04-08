# govgrant-app 진행 상황

> 마지막 업데이트: 2026-04-08 (저녁)
> 마지막 commit: `2945045` (성별 기반 복지 필터링)
> Live: <https://govgrant-app.vercel.app>

마스터 플랜은 [`docs/PLAN.md`](./PLAN.md), 집에서 이어 작업 절차는 [`docs/HANDOFF.md`](./HANDOFF.md) 참조.

---

## ✅ 누적 완료 (Phase별)

### Phase 0 — 인프라 준비 ✅
- `.env.example`, `docs/SETUP.md`, `docs/ENV.md` 작성
- Supabase dev/prod 프로젝트, Anthropic, OpenAI, Google OAuth 키 발급
- Vercel env 등록 (Production/Preview/Development)
- 카카오 OAuth: **deferred** (Phase 1.5)

### Phase 1 — 인증 & DB 마이그레이션 ✅
- 14개 테이블 + 9개 트리거 + 20+ RLS 정책
- `src/lib/supabase/{client,server,admin}.ts`
- `src/proxy.ts` (Next.js 16 — middleware 아님)
- `/auth/sign-in`, `/auth/callback`, `/auth/sign-out`, `useAuth`, `useAccountHydration`
- localStorage → Supabase 자동 이관
- Zustand `user-store`에 fire-and-forget Supabase sync 11개 헬퍼
- 다중 브라우저 동기화 검증 ✅

### Phase 2 — LLM 인프라 ✅
- `src/lib/llm/` (types, cost, metering, guard, router, providers)
- Anthropic + OpenAI 양쪽 complete/stream + OpenAI embed
- `/api/llm/complete` 내부 테스트 엔드포인트
- `canSpend()` 일일 한도 + 클라이언트 번들 누출 0건 검증

### Phase 3 — AI 사업계획서 도우미 ✅
- 7섹션 프롬프트 (사업개요/시장/모델/계획/예산/기대효과/팀)
- `/api/proposals/*` POST/GET/PATCH/DELETE + SSE generate/section
- `/proposals` 목록/생성/에디터 페이지 + 버전 히스토리
- Markdown / DOCX 다운로드 (한글 파일명 RFC 5987)
- 과제 상세 페이지 "AI 사업계획서 초안 만들기" CTA
- **Phase 6 통합 fix**: grantId가 Supabase UUID여도 작동 (commit `c7f309e`)

### Phase 6 — 실데이터 파이프라인 ✅ (원래 Phase 6~10 중 일부 선행)
5개 데이터 소스 통합 완료:

| 소스 | 가용 | prod 적재 | 특징 |
|---|---|---|---|
| **MSIT** (과학기술정보통신부) | 4,008 | ~100 | R&D 위주, 페이지당 10건 고정 |
| **BIZINFO** (기업마당) | 1,190 | ~500 | 전 부처 통합, 신청기간 명시 |
| **MSS** (중소벤처기업부) | 2,052 | ~100 | XML, 일일 100건 제한 |
| **BOKJIRO_CENTRAL** (중앙부처복지) | 373 | **373 (전체)** | 개인 복지, category="복지" |
| **BOKJIRO_LOCAL** (지자체복지) | 4,559 | **~5,000 (upsert)** | 시도/시군구 단위 |
| **합계** | **~12,182** | **~6,073** | |

주요 구현:
- `src/lib/data-sources/` — 5개 어댑터 (`msit`, `bizinfo`, `mss`, `bokjiro`, `nts`)
- `src/lib/data-sources/nts.ts` — 국세청 사업자등록번호 검증
- `src/lib/grants/repository.ts` — mock ↔ Supabase 자동 폴백
- `/api/admin/sync-grants?source=X` — 소스별 수동 동기화
- **Vercel Seoul region (icn1)** 고정 — 한국 정부 API 해외 IP 차단 해결
- `/api/grants` 기본값: 마감 과제 자동 제외 (사용자 제보 반영)
- `formatDate("")` / `daysUntil("")` safeParse — 빈 날짜 crash 방지

### Phase 6.5 — LLM Enrichment ✅
- `src/lib/enrichment/extract.ts` — HTML → 구조화 metadata (Zod schema)
- `src/app/api/admin/enrich-grants/route.ts` — batch 처리
- Anthropic Sonnet 4.5로 tags / requirements / amountLabel 추출
- **316건 enriched**, 비용 $2.38
- **Phase B (첨부 파싱)** 까지 확장:
  - `src/lib/enrichment/attachments.ts` — PDF + hwpx 지원
  - Claude Sonnet 4.5 **native PDF input** 사용 (외부 lib 불필요)
  - hwpx는 JSZip + section XML 정규식 파싱
  - 금액 `최대 8.8억원` / 정량 자격 (업력/상시근로자/합산경력) 추출 검증

### Phase 4 — pgvector + 임베딩 (인프라만) ⏳
- `supabase/migrations/20260425000000_phase4_embeddings.sql`
  - `grant_embeddings` / `proposal_examples` 테이블
  - HNSW 인덱스 + 2개 RPC 함수 (semantic search)
- `src/lib/embeddings/grants.ts` — batch runner
- `/api/admin/embed-grants` — pending 행 임베딩
- **블로커**: OpenAI 잔액 0 → 임베딩 실제 실행 대기
- 충전 후 cron에서 자동 처리되게 이미 연결됨

### D — Vercel Cron ✅
- `/api/cron/daily` — 매일 03:00 KST 자동 파이프라인
- **4단계**: sync-grants (5 소스) → enrich-grants → embed-grants → send-digest
- 각 단계 독립 실행 (1개 실패가 다른 단계 차단 안 함)
- `vercel.json` regions=["icn1"] + crons 설정
- 수동 테스트: `curl -H "Authorization: Bearer $ADMIN_SYNC_TOKEN" https://govgrant-app.vercel.app/api/cron/daily`

### Phase C-A — B2B 포트폴리오 대시보드 ✅
- `/portfolio` — 조직 카드 그리드 (각 카드: 추천/임박/저장 수 요약)
- `/portfolio/[orgId]` — 조직별 상세 (마감 임박 + 맞춤 추천 섹션)
- 헤더/모바일 네비에 "포트폴리오" 메뉴
- feature flag: `NEXT_PUBLIC_USE_PORTFOLIO`
- Phase 1 `UserAccount.organizations` 배열 그대로 재활용 (DB 변경 없음)

### Phase C-C — Resend 이메일 알림 ✅
- `src/lib/email/client.ts` — Resend wrapper (no API key면 silently no-op)
- `src/lib/email/templates/portfolio-digest.ts` — HTML + plain-text 템플릿
- `src/lib/notifications/digest.ts` — 조직별 digest 빌더
- `/api/admin/send-digest` — 수동/cron 트리거
- cron 파이프라인 Step 4에 통합
- **실제 발송 검증**: ydae7545@gmail.com으로 정상 수신, 스팸 아님 ✅

### 검색 & 매칭 개선 ✅
- 검색 페이지 **"맞춤 추천" 모드** (기본 ON)
  - 활성 컨텍스트로 client-side 매칭 점수 계산
  - 점수 30 미만 숨김, 내림차순 정렬
  - 프로필 완성도 부족 시 유도 배너
- 활성 조직 region 자동 감지 → 지역 필터 초기값
- **Phase 6.6 — 복지 타겟팅 필터**:
  - `PersonalProfile.gender` 필드 추가 + 온보딩/마이페이지 UI
  - `match-score.ts` `isExcludedByTargeting()`: male → 임산부/여성 배제, 연령 불일치 노인/청소년 배제, 자녀 없음 → 다자녀 배제
  - 성별 미설정 사용자에게는 필터 적용 안 함 (안전 기본값)

---

## 🏗 아키텍처 최종 스냅샷

```
govgrant-app/
├── src/
│   ├── app/
│   │   ├── (public)/            # 랜딩, 검색, 과제 상세, 캘린더, 챗봇
│   │   ├── (protected)/
│   │   │   ├── dashboard         # 홈
│   │   │   ├── mypage            # 마이페이지 (프로필 + 저장 + 조직)
│   │   │   ├── onboarding        # 5단계 온보딩 (+ 성별)
│   │   │   ├── proposals         # Phase 3 사업계획서
│   │   │   └── portfolio         # Phase C-A B2B 대시보드
│   │   └── api/
│   │       ├── grants            # 검색 repository (mock ↔ Supabase)
│   │       ├── grants/[id]       # 단건 조회
│   │       ├── recommendations   # 맞춤 추천
│   │       ├── chat              # 챗봇 (keyword 매칭, Phase 4 RAG 교체 대기)
│   │       ├── proposals/**      # Phase 3 CRUD + SSE
│   │       ├── business/verify   # NTS 사업자등록번호 검증
│   │       ├── admin/
│   │       │   ├── sync-grants       # 5 source 동기화
│   │       │   ├── enrich-grants     # HTML LLM 파싱
│   │       │   ├── enrich-attachments # Phase B PDF/hwpx 파싱
│   │       │   ├── embed-grants      # Phase 4 임베딩 (OpenAI 대기)
│   │       │   └── send-digest       # Resend 이메일
│   │       └── cron/daily        # 일일 파이프라인
│   ├── lib/
│   │   ├── data-sources/         # 5 어댑터 + NTS
│   │   ├── enrichment/           # extract (HTML) + attachments (PDF/hwpx)
│   │   ├── embeddings/           # Phase 4 grant embed runner
│   │   ├── email/                # Resend client + 템플릿
│   │   ├── llm/                  # Anthropic + OpenAI 라우터
│   │   ├── notifications/        # digest 빌더
│   │   ├── grants/repository.ts  # mock ↔ Supabase 통합 reader
│   │   ├── match-score.ts        # 매칭 점수 + 복지 배제 로직
│   │   └── supabase/             # client/server/admin
│   ├── components/
│   │   ├── ui/                   # shadcn/ui (Radix)
│   │   ├── layout/               # header + mobile-nav
│   │   ├── profile/              # OrgForm (+ 사업자번호 검증 UI)
│   │   ├── grant/                # grant-card
│   │   └── proposal/             # toolbar + section-editor + version-history
│   ├── store/user-store.ts       # Zustand v2 (+ gender 필드)
│   └── types/user.ts, grant.ts, proposal.ts
├── supabase/migrations/          # 4개 마이그레이션 파일
├── vercel.json                   # regions=icn1 + crons
└── docs/                         # PLAN, PROGRESS, HANDOFF, SETUP, ENV
```

---

## 📊 오늘 (2026-04-08) 완료한 commits (25개)

```
2945045 feat(matching): 성별/연령/타겟태그 기반 복지 필터링 + 성별 UI
54b5a59 docs(progress): Phase 6 bokjiro 복지 어댑터 + 5000건 적재 기록
61f9fb3 fix(bokjiro): 실제 API 응답 스키마로 필드명 보정
5dbabc5 fix(bokjiro): central=srchKeyCode 필수, local=없음 분기
7987b13 feat(phase-6): 복지로(bokjiro) 중앙부처+지자체 복지서비스 어댑터
17e92ab fix: 빈 application date로 인한 과제 상세 페이지 crash + D-NaN 표시
830cc76 feat(search): 컨텍스트 기반 매칭 점수 정렬 + "맞춤 추천" 모드
c7f309e fix(phase-3): 사업계획서 생성 흐름에 Supabase UUID grant 지원
33c3a94 feat(phase-C-C): Resend 이메일 알림 인프라 + 포트폴리오 digest
8e5179c feat(phase-C): B2B 포트폴리오 대시보드 MVP
9c0519c feat(phase-B): 첨부 파일(.pdf + .hwpx) 기반 심화 enrichment
537f3f8 fix(cron): NEXT_PUBLIC_APP_URL을 base로 사용
af8f9d4 feat(phase-4): pgvector 임베딩 인프라 + Vercel Cron 일일 파이프라인
79da7a9 docs(progress): Phase 6 MSS + 6.5 + 마감 필터 기록
7effb99 fix(phase-6): /api/grants 기본값에서 마감 과제 자동 제외
c2aae9d feat(phase-6.5): LLM enrichment 엔진 + /api/admin/enrich-grants
0f212aa feat(phase-6): 중소벤처기업부 (MSS) 사업공고 어댑터 추가
19dfa38 docs(progress): Phase 6 두 번째 청크 기록
8bb1e2f fix(phase-6): Vercel 프로젝트 전체 region을 Seoul (icn1)로 고정
9203c0f fix(phase-6): sync-grants route Seoul region (per-route, 이후 폐기)
1a53739 feat(phase-6): NTS 사업자번호 검증 + 기업마당 어댑터 (전 부처 통합)
0f212aa feat(phase-6): 중기부 어댑터 (동일 commit 재)
20e1ab8 fix(phase-6): MSIT API numOfRows 무시 → 페이지 break 조건
ec9bb63 fix(phase-6): MSIT 실제 응답 형태 반영
8fffb82 feat(phase-6): MSIT 어댑터 + grants repository + sync API
```

---

## 🚧 남은 과제 (우선순위 순)

### 🔴 즉시 시작 가능 (블로커 없음)
1. **Kakao OAuth 재개** — Phase 0에서 deferred. 로그인 옵션 추가
2. **도메인 등록** — `govgrant.co.kr` 같은 자체 도메인 → Resend `from` 주소 교체 (스팸 스코어 개선)
3. **첨부 파일 batch enrichment** — `/api/admin/enrich-attachments`를 prod MSS 100건에 실행 → 금액/자격 정량값 채움 (예상 비용 $12)
4. **검색 UI 개선** — 개인 복지 카드에 "성별/연령 조건" 배지 표시, 지자체 공고 시군구 그룹화

### 🟡 OpenAI 충전 후 (블로커: $5)
5. **Phase 4 청크 2 — Semantic Search**
   - 기존 전체 grants 임베딩 (~$0.07)
   - `/api/grants/semantic?q=...` 엔드포인트
   - 검색 페이지에 "의미 검색" 토글 ("청년수당" → "청년기본소득" 자동 매칭)
6. **Phase 4 청크 3 — RAG 사업계획서**
   - `proposal_examples` 테이블에 선정 사례 import (수동 또는 크롤링)
   - Phase 3 `proposal-user.ts`의 `pastExamples` 자리 연결
   - 생성 품질 before/after 비교

### 🟢 중간 우선순위
7. **Phase 5 알림 확장** — 이메일 opt-in/opt-out UI, D-7/3/1 다중 빈도
8. **Phase 7 B2B 확장** — 포트폴리오 초대 시스템 (여러 운영자 공유), 교차 매칭 테이블 뷰
9. **매칭 로직 정교화**
   - 여성 사용자에게 남성 전용 공고 배제 (현재는 남성만 처리)
   - 소득 수준 기반 "저소득 전용" 복지 필터
10. **Cron embed 실패 로깅 개선** — 현재는 `ok: true`로 반환되어 부분 실패 감지 어려움

### 🔵 후순위 (Phase 8~10)
11. **Phase 8 — 수익화** (Toss Payments 구독, 플랜별 한도)
12. **Phase 9 — 운영/모니터링** (Sentry, PostHog, 관리 대시보드)
13. **Phase 10 — 모바일 앱** (Expo)

### 🔐 알려진 보안/기술 부채
- Anthropic 키가 채팅 기록에 노출됨 (`...vcKcvwAA`) — revoke + 새 키로 교체 권장
- OpenAI 잔액 0 — Phase 4 활성화 블로커
- Bokjiro 매일 적재: 기존 upsert 패턴이라 중복 누적 없음, but 삭제된 공고 감지 안 됨
- `usage_events` 는 user_id 필수라 cron system 이벤트 로깅 안 됨 (현재는 console 로그만)

---

## 📊 현재 prod 상태

### 데이터
- grants: 약 6,073건 (마감 제외 ~662건 노출)
- enrichment: 316건 enriched, 나머지 pending 또는 skipped
- embeddings: 0건 (OpenAI 충전 대기)

### 비용 (4월 8일 현재)
| 서비스 | 사용 | 잔액 |
|---|---|---|
| Anthropic | Phase 3 ($0.5~1) + Phase 6.5 enrich ($2.38) + Phase B 테스트 ($0.25) | ~$1.4 |
| OpenAI | $0 | $0 (충전 필요) |
| data.go.kr | 무료, 일일 10,000 호출 한도 | 사용량 극소 |
| bizinfo.go.kr | 무료 | - |
| Resend | 무료 (월 3,000건) | - |
| Supabase (dev + prod) | Free tier | - |
| Vercel | Hobby 무료 | - |

### 자동 실행
- 매일 03:00 KST: Vercel Cron `/api/cron/daily`
  1. sync-grants (MSIT + BIZINFO + MSS + bokjiro_central + bokjiro_local)
  2. enrich-grants (pending 30 + 20)
  3. embed-grants (100) ← OpenAI 충전 후 활성
  4. send-digest (포트폴리오 운영자에게 이메일)
