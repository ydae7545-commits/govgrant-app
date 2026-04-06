"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Building2,
  Calendar,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useUserStore } from "@/store/user-store";
import { calculateMatchScore } from "@/lib/match-score";
import {
  formatDate,
  formatAmountRange,
  getDeadlineLabel,
  getOriginalSourceUrl,
} from "@/lib/format";
import type { Grant } from "@/types/grant";

export default function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [mounted, setMounted] = useState(false);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [loading, setLoading] = useState(true);

  const account = useUserStore((s) => s.account);
  const savedGrantIds = useUserStore((s) => s.savedGrantIds);
  const toggleSaveGrant = useUserStore((s) => s.toggleSaveGrant);
  const addRecentViewed = useUserStore((s) => s.addRecentViewed);
  const getActiveContext = useUserStore((s) => s.getActiveContext);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    async function fetchGrant() {
      try {
        const res = await fetch(`/api/grants/${id}`);
        if (res.ok) {
          const data = await res.json();
          setGrant(data);
          addRecentViewed(id);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }

    fetchGrant();
  }, [mounted, id, addRecentViewed]);

  if (!mounted || loading) {
    return <div className="p-8 text-center text-gray-400">Loading...</div>;
  }

  if (!grant) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">해당 지원사업을 찾을 수 없습니다.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/search">검색으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const isSaved = savedGrantIds.includes(grant.id);
  const deadline = getDeadlineLabel(grant.applicationEnd);
  const matchScore = account ? calculateMatchScore(grant, getActiveContext()) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Back Button */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2 text-gray-500"
      >
        <Link href="/search">
          <ArrowLeft className="mr-1 h-4 w-4" />
          목록으로
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{grant.category}</Badge>
          {deadline.urgent && (
            <Badge variant="destructive">{deadline.text}</Badge>
          )}
          {!deadline.urgent && deadline.text !== "마감" && (
            <Badge variant="outline">{deadline.text}</Badge>
          )}
          {deadline.text === "마감" && (
            <Badge variant="outline" className="text-gray-400">
              마감
            </Badge>
          )}
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">{grant.title}</h1>
        <p className="text-gray-500">{grant.summary}</p>
      </div>

      {/* Match Score */}
      {matchScore !== null && (
        <Card className="mb-6 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              나와의 적합도
            </span>
            <span className="text-lg font-bold text-blue-600">
              {matchScore}%
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${matchScore}%` }}
            />
          </div>
        </Card>
      )}

      {/* Key Info */}
      <Card className="mb-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">주관기관</p>
              <p className="text-sm font-medium text-gray-900">
                {grant.organization}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">지역</p>
              <p className="text-sm font-medium text-gray-900">{grant.region}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">접수 기간</p>
              <p className="text-sm font-medium text-gray-900">
                {formatDate(grant.applicationStart)} ~{" "}
                {formatDate(grant.applicationEnd)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-5 w-5 items-center justify-center text-sm text-gray-400">
              $
            </span>
            <div>
              <p className="text-xs text-gray-400">지원 금액</p>
              <p className="text-sm font-medium text-blue-600">
                {formatAmountRange(grant.amountMin, grant.amountMax)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Description */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-gray-900">상세 설명</h2>
        <p className="whitespace-pre-line leading-relaxed text-gray-600">
          {grant.description}
        </p>
      </div>

      <Separator className="mb-6" />

      {/* Eligibility */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-gray-900">지원 자격 요건</h2>
        <ul className="space-y-2">
          {grant.eligibility.requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span className="text-sm text-gray-600">{req}</span>
            </li>
          ))}
          {grant.eligibility.ageMin && (
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span className="text-sm text-gray-600">
                만 {grant.eligibility.ageMin}세 이상
                {grant.eligibility.ageMax && ` ~ ${grant.eligibility.ageMax}세 이하`}
              </span>
            </li>
          )}
          {grant.eligibility.businessAgeMax && (
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span className="text-sm text-gray-600">
                업력 {grant.eligibility.businessAgeMax}년 이하
              </span>
            </li>
          )}
          {grant.eligibility.employeeMax && (
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span className="text-sm text-gray-600">
                종업원 {grant.eligibility.employeeMax}인 이하
              </span>
            </li>
          )}
        </ul>
      </div>

      {/* Tags */}
      {grant.tags.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-bold text-gray-900">태그</h2>
          <div className="flex flex-wrap gap-2">
            {grant.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator className="mb-6" />

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant={isSaved ? "secondary" : "outline"}
          onClick={() => toggleSaveGrant(grant.id)}
          className="flex-1"
        >
          <Bookmark
            className={`mr-2 h-4 w-4 ${
              isSaved ? "fill-blue-600 text-blue-600" : ""
            }`}
          />
          {isSaved ? "저장됨" : "저장하기"}
        </Button>
        <Button asChild className="flex-1">
          <a
            href={getOriginalSourceUrl({
              url: grant.url,
              title: grant.title,
              organization: grant.organization,
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            원문 보기
          </a>
        </Button>
      </div>
    </div>
  );
}
