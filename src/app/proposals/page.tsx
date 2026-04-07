"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { featureFlags } from "@/lib/env";
import type { Proposal, ProposalStatus } from "@/types/proposal";

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "초안",
  in_progress: "작성 중",
  completed: "완료",
  archived: "보관",
};

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  archived: "bg-amber-100 text-amber-700",
};

export default function ProposalsListPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!featureFlags.useProposalAi) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/proposals");
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/auth/sign-in?redirectTo=/proposals";
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as { proposals: Proposal[] };
        if (!cancelled) setProposals(json.proposals ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!featureFlags.useProposalAi) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">사업계획서 도우미</h1>
        <p className="mt-3 text-sm text-gray-600">
          이 기능은 아직 비활성화되어 있습니다.
          <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">
            NEXT_PUBLIC_USE_PROPOSAL_AI
          </code>
          를 켜면 사용할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 사업계획서</h1>
          <p className="mt-1 text-sm text-gray-600">
            AI가 생성한 초안을 편집하고 다운로드하세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/proposals/new">
            <Plus className="mr-1.5 h-4 w-4" />
            새 초안
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-500">불러오는 중...</p>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-700">불러오기 실패: {error}</p>
        </Card>
      ) : proposals.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <FileText className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">
            아직 작성한 사업계획서가 없습니다.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/search">관심 과제 찾아보기</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <Link key={p.id} href={`/proposals/${p.id}`}>
              <Card className="p-4 transition hover:border-blue-300 hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-gray-900">
                      {p.title}
                    </h2>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(p.updatedAt).toLocaleDateString("ko-KR")}
                      </span>
                      <span>v{p.version}</span>
                      {p.costEstimateUsd > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {p.costEstimateUsd.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={STATUS_COLORS[p.status]}>
                    {STATUS_LABELS[p.status]}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
