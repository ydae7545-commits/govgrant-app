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

export function GrantCard({ grant }: { grant: Grant }) {
  const { savedGrantIds, toggleSaveGrant } = useUserStore();
  const isSaved = savedGrantIds.includes(grant.id);
  const deadline = getDeadlineLabel(grant.applicationEnd);

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
