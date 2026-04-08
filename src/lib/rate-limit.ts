import "server-only";

/**
 * 가벼운 in-memory rate limiter (token bucket).
 *
 * 사용 목적: 무인증 API 엔드포인트 (`/api/grants`, `/api/business/verify`,
 * `/api/recommendations`) 에 대한 abuse 방지. 한 IP 가 짧은 시간에 너무
 * 많은 요청을 보내면 429 응답.
 *
 * 한계 + 의도된 trade-off:
 *   - **단일 instance 기반**: Vercel serverless 는 함수마다 별도 process 라
 *     instance 간 카운터 공유 안 됨. 여러 instance 가 동시 작동하면 한 IP
 *     가 instanceCount × limit 만큼 보낼 수 있음. 이 정도 leakage 는 abuse
 *     방어 수준으로 충분.
 *   - **메모리 기반**: instance 가 idle 후 cold start 시 카운터 리셋. 짧은
 *     burst 를 막는 게 목적이라 OK.
 *   - **글로벌 분산이 필요해지면** Upstash Redis 같은 외부 store 로 교체
 *     예정. 그 때까지는 in-memory 가 충분 + 외부 의존 0.
 *
 * Token bucket 알고리즘:
 *   - 각 key (IP) 마다 bucket: { tokens, refilledAt }
 *   - 요청이 오면 (now - refilledAt) 시간만큼 토큰 보충 (capacity 한도)
 *   - 토큰 1개 차감, 0 미만이면 거부
 *
 * Bucket 청소:
 *   - 메모리 누수 방지를 위해 100건마다 1회 expired bucket 정리.
 *
 * 사용 예:
 *   const result = checkRateLimit({ key: ip, limit: 60, windowMs: 60_000 });
 *   if (!result.allowed) return new Response("Too Many Requests", { status: 429 });
 */

interface Bucket {
  tokens: number;
  refilledAt: number; // ms timestamp
  lastUsedAt: number;
}

const BUCKETS = new Map<string, Bucket>();

let opsSinceLastSweep = 0;
const SWEEP_EVERY_OPS = 100;
const BUCKET_TTL_MS = 60 * 60 * 1000; // 1h idle 후 정리

export interface RateLimitArgs {
  /** 보통 IP 주소. 익명 글로벌 카운터를 원하면 빈 문자열 같은 상수. */
  key: string;
  /** 윈도우 안에 허용할 최대 요청 수. */
  limit: number;
  /** 윈도우 길이 (ms). 토큰 1개 보충에 limit/windowMs 의 역수만큼 걸림. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 0 이상이면 다음 토큰 추가까지 남은 시간 (ms). 클라이언트 retry-after 헤더용. */
  retryAfterMs: number;
  /** 디버깅용 — 현재 남은 토큰 수. */
  remaining: number;
}

export function checkRateLimit(args: RateLimitArgs): RateLimitResult {
  const now = Date.now();
  const refillRatePerMs = args.limit / args.windowMs;

  let bucket = BUCKETS.get(args.key);
  if (!bucket) {
    bucket = {
      tokens: args.limit,
      refilledAt: now,
      lastUsedAt: now,
    };
    BUCKETS.set(args.key, bucket);
  }

  // Refill: (현재 시각 - 마지막 refill 시각) 만큼 토큰 추가, capacity 한도
  const elapsed = now - bucket.refilledAt;
  if (elapsed > 0) {
    bucket.tokens = Math.min(
      args.limit,
      bucket.tokens + elapsed * refillRatePerMs
    );
    bucket.refilledAt = now;
  }
  bucket.lastUsedAt = now;

  // 주기적 청소
  opsSinceLastSweep++;
  if (opsSinceLastSweep >= SWEEP_EVERY_OPS) {
    opsSinceLastSweep = 0;
    sweepIdleBuckets(now);
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.floor(bucket.tokens),
    };
  }

  // 토큰 부족 — 1개 차오르는 데 걸리는 시간 계산
  const needed = 1 - bucket.tokens;
  const retryAfterMs = Math.ceil(needed / refillRatePerMs);
  return {
    allowed: false,
    retryAfterMs,
    remaining: 0,
  };
}

function sweepIdleBuckets(now: number): void {
  const cutoff = now - BUCKET_TTL_MS;
  for (const [key, bucket] of BUCKETS.entries()) {
    if (bucket.lastUsedAt < cutoff) {
      BUCKETS.delete(key);
    }
  }
}

/**
 * Helper: NextRequest 에서 클라이언트 IP 추출.
 * Vercel 은 x-forwarded-for 의 첫 IP 가 실제 클라이언트.
 * fallback 은 빈 문자열 (모든 익명 유저가 같은 버킷 공유 — abuse 시 안전).
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || "";
}
