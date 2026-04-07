"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockGrants } from "@/data/mock-grants";
import { useUserStore } from "@/store/user-store";
import { featureFlags } from "@/lib/env";
import { formatAmountRange } from "@/lib/format";

function NewProposalContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialGrantId = params.get("grantId") ?? "";

  const account = useUserStore((s) => s.account);
  const [grantId, setGrantId] = useState(initialGrantId);
  const [organizationId, setOrganizationId] = useState<string>("personal");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGrant = mockGrants.find((g) => g.id === grantId);
  const orgs = account?.organizations ?? [];

  useEffect(() => {
    if (account?.activeContextId && account.activeContextId !== "personal") {
      setOrganizationId(account.activeContextId);
    }
  }, [account?.activeContextId]);

  if (!featureFlags.useProposalAi) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-gray-600">기능이 비활성화되어 있습니다.</p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!selectedGrant) {
      setError("과제를 먼저 선택해주세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantId: selectedGrant.id,
          title: selectedGrant.title,
          organizationId:
            organizationId === "personal" ? null : organizationId,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/auth/sign-in?redirectTo=/proposals/new?grantId=${selectedGrant.id}`;
          return;
        }
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { proposal: { id: string } };
      router.push(`/proposals/${json.proposal.id}?autostart=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <Link
        href="/proposals"
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        목록으로
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">새 사업계획서</h1>
      <p className="mt-1 text-sm text-gray-600">
        과제와 작성 컨텍스트를 선택하면 AI가 7개 섹션을 자동으로 생성합니다.
      </p>

      <div className="mt-6 space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            1. 지원 과제
          </h2>
          {selectedGrant ? (
            <Card className="border-blue-200 bg-blue-50/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedGrant.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {selectedGrant.organization} · {selectedGrant.category}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    지원금 {formatAmountRange(selectedGrant.amountMin, selectedGrant.amountMax)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGrantId("")}
                >
                  변경
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="mb-3 text-xs text-gray-500">
                과제 ID로 빠르게 선택할 수 있습니다.
              </p>
              <div className="flex gap-2">
                <input
                  value={grantId}
                  onChange={(e) => setGrantId(e.target.value)}
                  placeholder="예: g001"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium text-gray-600">최근 과제</p>
                {mockGrants.slice(0, 5).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGrantId(g.id)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                  >
                    <span className="text-gray-400">{g.id}</span> · {g.title}
                  </button>
                ))}
                <Link
                  href="/search"
                  className="mt-2 block text-xs text-blue-600 hover:underline"
                >
                  전체 검색에서 고르기 →
                </Link>
              </div>
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            2. 작성 컨텍스트
          </h2>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setOrganizationId("personal")}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                organizationId === "personal"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">개인</p>
                <p className="text-xs text-gray-500">
                  {account?.displayName ?? "사용자"} 개인 프로필 기준
                </p>
              </div>
              <Badge variant="outline">개인</Badge>
            </button>
            {orgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => setOrganizationId(org.id)}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                  organizationId === org.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-500">
                    {org.kind} · {org.region}
                  </p>
                </div>
                <Badge variant="outline">조직</Badge>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-600">⚠ {error}</p>
        )}

        <Button
          onClick={handleCreate}
          disabled={!selectedGrant || creating}
          className="w-full"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {creating ? "초안 생성 중..." : "초안 만들기"}
        </Button>
      </div>
    </div>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm">로딩...</div>}>
      <NewProposalContent />
    </Suspense>
  );
}
