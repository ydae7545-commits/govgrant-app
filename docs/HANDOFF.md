# 집에서 이어 작업하는 절차

> 이 문서는 회사 PC ↔ 집 PC 에서 동일한 상태로 작업을 이어가기 위한 가이드입니다.
> 최근 업데이트: 2026-04-08

마스터 플랜은 [`docs/PLAN.md`](./PLAN.md), 현재 진행 상황은 [`docs/PROGRESS.md`](./PROGRESS.md) 참조.

---

## 🏁 요약: 3 파일만 보면 됩니다

| 파일 | 역할 |
|---|---|
| `docs/PROGRESS.md` | **오늘까지 뭘 했는지 / 남은 게 뭔지** — 가장 먼저 읽기 |
| `docs/PLAN.md` | 전체 Phase 0~10 마스터 플랜 |
| `docs/HANDOFF.md` (이 파일) | 집 PC 에서 이어가는 절차 |

**모두 GitHub에 푸시되어 있어서** 집 PC 에서 `git clone` 만 해도 자동으로 받아집니다.

---

## 🏠 집 PC 첫 1회 셋업 (15분)

### 1. 사전 도구 설치 (회사 PC와 동일하게)

- **Node.js 22 LTS** (또는 최소 20)
- **Git** (GitHub 인증 포함)
- **VS Code** (또는 원하는 에디터)
- **PowerShell 7** 또는 **Windows Terminal** (권장)

### 2. 리포 클론 + 의존성 설치

```powershell
# 원하는 폴더로 이동
cd ~\Desktop

# 클론 (HTTPS 또는 SSH)
git clone https://github.com/ydae7545-commits/govgrant-app.git
cd govgrant-app

# 의존성 설치
npm install
```

### 3. Vercel CLI 설치 + 프로젝트 연결

```powershell
npm i -g vercel
vercel login     # 브라우저로 OAuth device flow (1회)
vercel link      # govgrant-app 프로젝트 연결
# → "ydae7545-commits-projects" scope → "govgrant-app" 선택
```

### 4. 환경변수 한 번에 다운로드

**이 한 줄로 모든 키가 동기화됩니다** (회사 PC에서 등록한 그대로):

```powershell
vercel env pull .env.local
```

이 명령이 `.env.local` 파일에 다음을 자동으로 채워줍니다:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (dev 프로젝트)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `DATA_GO_KR_SERVICE_KEY`, `BIZINFO_API_KEY`
- `ADMIN_SYNC_TOKEN`, `RESEND_API_KEY`, `CRON_SECRET`
- `NEXT_PUBLIC_USE_*` 모든 feature flag

> ⚠️ `vercel env pull` 은 기본이 Development environment. Production 값을
> 보려면 `--environment=production` 플래그. 로컬 개발엔 Development 로 충분.

### 5. dev 서버 실행 + 접속 확인

```powershell
npm run dev
```

→ http://localhost:3000 열어서 홈 로딩 확인 → 완료.

---

## 🔄 매번 작업 시작할 때 (30초)

```powershell
cd path\to\govgrant-app

# 최신 commit 받기
git pull

# 환경변수 혹시 추가됐을 수 있으니 동기화 (선택, 대부분 skip)
vercel env pull .env.local

# dev 서버
npm run dev
```

---

## 💾 매번 작업 끝낼 때

```powershell
# 변경 파일 확인
git status

# 스테이징 + 커밋 (의미 있는 단위로)
git add -A
git commit -m "feat: 내용 요약"

# GitHub + 회사 PC 에 반영
git push
```

**Vercel은 GitHub push 감지하면 자동 배포**하지만, 수동 배포가 필요하면:
```powershell
vercel --prod --yes
```

---

## 🤖 새 Claude Code 세션 시작 시 (집 PC 에서 이어가기)

회사에서 작업한 컨텍스트를 집 Claude에게 그대로 물려주는 가장 빠른 방법:

### 첫 메시지 템플릿

````
govgrant-app 작업 이어서 할게.

다음을 순서대로 읽어줘:
1. docs/PROGRESS.md — 오늘까지 뭘 했는지
2. docs/HANDOFF.md — 현재 환경 설정 방법
3. docs/PLAN.md — 전체 로드맵 (필요 시만)

마지막 commit: [여기 git log -1 결과 붙여넣기]
prod: https://govgrant-app.vercel.app

오늘은 [다음 항목] 을 하고 싶어.
````

### Claude가 알아야 할 핵심 컨텍스트

- **Next.js 16** + App Router + Turbopack + Tailwind 4
- `cookies()`, `params`, `searchParams` 모두 **async** (await 필요)
- `src/proxy.ts` = Next.js 16 "proxy" (middleware 아님)
- Supabase SSR은 `getAll`/`setAll` 쿠키 패턴 (deprecated get/set/remove X)
- Vercel Hobby 플랜 → `vercel.json` `regions: ["icn1"]` 필수 (한국 정부 API 해외 IP 차단)
- Anthropic 키가 대화 기록에 노출돼 있음 — 필요 시 revoke

### Claude 가 바로 이어받아 할 수 있는 것

- 기존 패턴을 그대로 복제해서 새 기능 추가 (예: 새 data source 어댑터)
- 버그 수정 (에러 메시지 주면 즉시 진단)
- UI 개선 / 새 페이지 추가
- 빌드/배포 (Vercel CLI 명령어 알고 있음)

### 주의할 점

- Claude 세션마다 **context가 초기화** 되므로, 진행 상황은 반드시 `docs/PROGRESS.md` 에 기록해두기
- 큰 변경 전에는 `git status` 로 로컬 변경사항 확인
- 회사 PC 에서도 `git pull` 먼저 하는 습관

---

## 🧪 빠른 검증 체크리스트 (집 PC 환경 구축 후)

모두 동작해야 회사 PC와 동일한 상태:

### 1. 로컬 dev 서버
```powershell
npm run dev
# http://localhost:3000 → 홈 페이지 로딩 OK?
```

### 2. 빌드
```powershell
npm run build
# 33 routes + 0 error + 0 leak
```

### 3. 검색 (Supabase grants 연결 확인)
브라우저에서 http://localhost:3000/search → 결과 로딩 확인 (dev Supabase에 적재된 수십 건 보일 것)

### 4. LLM 호출 (Anthropic)
```powershell
# 사업계획서 테스트: /proposals/new → 과제 선택 → "초안 만들기"
# 7 섹션 스트리밍 생성되면 OK
```

### 5. Cron 수동 실행 (선택)
```powershell
# local 에선 ADMIN_SYNC_TOKEN="local-dev-only-token-not-for-prod"
curl -H "Authorization: Bearer local-dev-only-token-not-for-prod" `
  http://localhost:3000/api/cron/daily
```

---

## 🆘 자주 발생하는 문제

### "vercel env pull" 권한 에러
```powershell
# Vercel 재로그인
vercel logout
vercel login
vercel link
```

### `.next` 캐시 이상 (dev 서버가 이상한 에러)
```powershell
Remove-Item -Recurse -Force .next
npm run dev
```

### PowerShell에서 `rm -rf`가 안 됨
`rm -rf` 는 Unix 문법. PowerShell:
```powershell
Remove-Item -Recurse -Force .next
```

### 포트 3000 사용 중
```powershell
# 프로세스 찾기
Get-NetTCPConnection -LocalPort 3000 | Select-Object -Property OwningProcess
# 또는 npm run dev -- -p 3001
```

### Claude Code 가 docs 파일을 못 찾음
대화 초반에 명시:
> "docs/PROGRESS.md, docs/HANDOFF.md, docs/PLAN.md 읽고 시작해줘"

---

## 📊 중요 URL 모음

### Live
- Prod: https://govgrant-app.vercel.app
- GitHub: https://github.com/ydae7545-commits/govgrant-app

### 대시보드
- Vercel: https://vercel.com/ydae7545-commits-projects/govgrant-app
- Supabase dev: https://supabase.com/dashboard/project/mfvupsrsxvrsrbbgvcur
- Supabase prod: https://supabase.com/dashboard/project/lbmosmubjuzxcdqdbglv
- Anthropic console: https://console.anthropic.com
- OpenAI console: https://platform.openai.com
- data.go.kr 마이페이지: https://www.data.go.kr/iim/api/selectAcountList.do
- Resend: https://resend.com/overview

### 프로젝트 내부 문서
- `docs/PLAN.md` — Phase 0~10 마스터 플랜
- `docs/PROGRESS.md` — 현재 진행 상황 (가장 중요)
- `docs/HANDOFF.md` — 이 문서
- `docs/SETUP.md` — Phase 0 외부 서비스 설정 가이드
- `docs/ENV.md` — 환경변수 레퍼런스
- `AGENTS.md` — AI 개발자용 주의사항 (Next.js 16)
- `.env.example` — 환경변수 템플릿

---

## 🎯 집에서 다음 세션 시작할 때 추천 첫 단계

1. **PROGRESS.md 의 "🚧 남은 과제" 섹션** 보고 하나 고르기
2. 가장 쉬운 두 가지:
   - **Anthropic 키 rotation**: 집 PC 에서 새 키 발급 → `vercel env rm` + `vercel env add` (Claude 와 함께 쉽게 가능)
   - **카카오 OAuth 재개**: Redirect URI 못 찾아서 deferred. 새 Supabase 대시보드 가이드 보고 재시도
3. 돈 드는 것 없이 가장 가치 큰 것:
   - **Phase 4 OpenAI 충전** + **semantic search 활성화**: $5 충전 → "청년수당" 검색이 "청년기본소득" 도 잡도록 품질 극적 개선

---

## 🔔 오늘 상태 안 잃어버리기 — 체크리스트

집에 가기 전 회사에서 한 번 확인:

- [x] `git status` → 모든 변경사항 커밋 완료
- [x] `git push` → GitHub 최신
- [x] `docs/PROGRESS.md` 최신 (마지막 commit 해시 포함)
- [x] 이 `docs/HANDOFF.md` 최신
- [x] Prod 배포 최신 (`vercel ls` 또는 https://govgrant-app.vercel.app 접속 확인)

집 도착해서 첫 실행:
- [ ] `cd govgrant-app && git pull` → 최신 코드
- [ ] `vercel env pull .env.local` → 최신 env
- [ ] `npm run dev` → 로컬 실행
- [ ] 새 Claude Code 세션 → "PROGRESS.md 읽고 시작" 전달
