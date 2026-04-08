"use client";

import Link from "next/link";
import { Bookmark, Clock, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useUserStore } from "@/store/user-store";
import { formatAmountRange, getDeadlineLabel } from "@/lib/format";
import type { Grant } from "@/types/grant";

const categoryColors: Record<string, string> = {
  창업지원: "bg-purple-100 text-purple-700",
  "R&D": "bg-blue-100 text-blue-700",
  정책자금: "bg-green-100 text-green-700",
  고용지원: "bg-orange-100 text-orange-700",
  수출지원: "bg-cyan-100 text-cyan-700",
  교육훈련: "bg-yellow-100 text-yellow-700",
  복지: "bg-pink-100 text-pink-700",
  주거: "bg-teal-100 text-teal-700",
  컨설팅: "bg-indigo-100 text-indigo-700",
  기타: "bg-gray-100 text-gray-700",
};

/**
 * 복지 공고의 타겟 태그를 사용자에게 한눈에 보이는 작은 배지로 변환.
 *
 * 매칭 키워드는 `lib/match-score.ts` 의 `isExcludedByTargeting` 과 동일한
 * 의미 체계를 사용한다 — 즉 한쪽이 추가/수정되면 다른 쪽도 같이 갱신해야
 * 사용자 입장에서 "필터링 기준"과 "카드에 표시되는 라벨"이 일치한다.
 *
 * 카드 공간이 좁아서 max 3개만 표시하고 나머지는 "+N" 으로 축약한다.
 */
type WelfareBadge = { label: string; className: string };

function getWelfareBadges(category: string, tags: string[]): WelfareBadge[] {
  if (category !== "복지") return [];
  const lowered = tags.map((t) => t.toLowerCase());
  const has = (kw: string) => lowered.some((t) => t.includes(kw));
  const badges: WelfareBadge[] = [];

  // 성별 / 가족 형태
  if (has("임산부") || has("산모")) {
    badges.push({ label: "임산부", className: "bg-pink-100 text-pink-700" });
  } else if (has("여성") && !has("남성")) {
    badges.push({ label: "여성", className: "bg-pink-100 text-pink-700" });
  }
  if (has("한부모")) {
    badges.push({
      label: "한부모",
      className: "bg-emerald-100 text-emerald-700",
    });
  }
  if (has("다자녀")) {
    badges.push({
      label: "다자녀",
      className: "bg-orange-100 text-orange-700",
    });
  }
  if (has("다문화")) {
    badges.push({
      label: "다문화",
      className: "bg-violet-100 text-violet-700",
    });
  }

  // 연령
  if (has("노인") || has("어르신")) {
    badges.push({ label: "노인", className: "bg-purple-100 text-purple-700" });
  }
  if (has("청소년")) {
    badges.push({ label: "청소년", className: "bg-cyan-100 text-cyan-700" });
  }
  if (has("영유아")) {
    badges.push({ label: "영유아", className: "bg-yellow-100 text-yellow-700" });
  } else if (has("아동")) {
    badges.push({ label: "아동", className: "bg-yellow-100 text-yellow-700" });
  }

  // 특수 그룹
  if (has("장애")) {
    badges.push({ label: "장애인", className: "bg-slate-100 text-slate-700" });
  }
  if (has("보훈") || has("국가유공자")) {
    badges.push({ label: "보훈", className: "bg-blue-100 text-blue-700" });
  }
  if (has("저소득") || has("기초생활")) {
    badges.push({ label: "저소득", className: "bg-amber-100 text-amber-700" });
  }

  return badges;
}

export function GrantCard({ grant }: { grant: Grant }) {
  const { savedGrantIds, toggleSaveGrant } = useUserStore();
  const isSaved = savedGrantIds.includes(grant.id);
  const deadline = getDeadlineLabel(grant.applicationEnd);
  const welfareBadges = getWelfareBadges(grant.category, grant.tags);

  return (
    <Card className="group relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className={categoryColors[grant.category] || ""}
          >
            {grant.category}
          </Badge>
          {deadline.urgent && (
            <Badge variant="destructive" className="text-xs">
              {deadline.text}
            </Badge>
          )}
          {!deadline.urgent && deadline.text !== "마감" && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {deadline.text}
            </span>
          )}
          {deadline.text === "마감" && (
            <Badge variant="outline" className="text-xs text-gray-400">
              마감
            </Badge>
          )}
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            toggleSaveGrant(grant.id);
          }}
          className="shrink-0 rounded-full p-1.5 hover:bg-gray-100"
        >
          <Bookmark
            className={`h-4 w-4 ${
              isSaved ? "fill-blue-600 text-blue-600" : "text-gray-400"
            }`}
          />
        </button>
      </div>

      <Link href={`/grants/${grant.id}`} className="flex flex-col gap-2">
        <h3 className="font-semibold leading-snug text-gray-900 group-hover:text-blue-600">
          {grant.title}
        </h3>
        <p className="line-clamp-2 text-sm text-gray-500">{grant.summary}</p>
        {grant.consortiumMatch && grant.consortium && (
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
            <span>🤝</span>
            <span className="line-clamp-1">
              컨소시엄 참여 가능 · {grant.consortium.role}
            </span>
          </div>
        )}

        {welfareBadges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {welfareBadges.slice(0, 3).map((b) => (
              <span
                key={b.label}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.className}`}
              >
                {b.label}
              </span>
            ))}
            {welfareBadges.length > 3 && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                +{welfareBadges.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {grant.organization}
          </span>
          <span>{grant.region}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-600">
            {formatAmountRange(grant.amountMin, grant.amountMax)}
          </span>
          {grant.matchScore !== undefined && grant.matchScore > 0 && (
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${grant.matchScore}%` }}
                />
              </div>
              <span className="text-xs font-medium text-blue-600">
                {grant.matchScore}%
              </span>
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
