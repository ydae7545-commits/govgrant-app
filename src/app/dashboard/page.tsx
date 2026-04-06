"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GrantCard } from "@/components/grant/grant-card";
import { useUserStore } from "@/store/user-store";
import type { Grant } from "@/types/grant";

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [recommendations, setRecommendations] = useState<Grant[]>([]);
  const [deadlineSoon, setDeadlineSoon] = useState<Grant[]>([]);
  const [recentGrants, setRecentGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);

  const { profile, recentViewedIds } = useUserStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    async function fetchData() {
      setLoading(true);
      try {
        // Fetch recommendations
        const recRes = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile }),
        });
        const recData = await recRes.json();
        setRecommendations(recData.grants || []);

        // Fetch deadline-soon grants
        const deadlineRes = await fetch(
          "/api/grants?sort=deadline&limit=10&status=마감임박"
        );
        const deadlineData = await deadlineRes.json();
        setDeadlineSoon(deadlineData.grants || []);

        // Fetch recent viewed grants
        if (recentViewedIds.length > 0) {
          const recentPromises = recentViewedIds.slice(0, 6).map((id) =>
            fetch(`/api/grants/${id}`).then((r) => r.json())
          );
          const recentResults = await Promise.all(recentPromises);
          setRecentGrants(recentResults.filter((g) => g && !g.error));
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [mounted, profile, recentViewedIds]);

  if (!mounted) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {profile ? `${profile.name}님, 안녕하세요!` : "안녕하세요!"}
        </h1>
        <p className="mt-1 text-gray-500">
          오늘의 맞춤 지원사업을 확인해보세요
        </p>
      </div>

      {/* No Profile Banner */}
      {!profile && (
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                프로필을 설정하면 맞춤 추천을 받을 수 있어요!
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                간단한 프로필 입력으로 나에게 딱 맞는 지원사업을 찾아보세요.
              </p>
            </div>
            <Button asChild>
              <Link href="/onboarding">
                프로필 설정하기
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-400">
          추천 결과를 불러오는 중...
        </div>
      ) : (
        <>
          {/* Recommendations */}
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Sparkles className="h-5 w-5 text-blue-600" />
                맞춤 추천
              </h2>
              <Link href="/search" className="text-sm text-blue-600 hover:underline">
                전체 보기
              </Link>
            </div>
            {recommendations.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.slice(0, 6).map((grant) => (
                  <GrantCard key={grant.id} grant={grant} />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center text-gray-400">
                추천 결과가 없습니다. 프로필을 설정해보세요.
              </Card>
            )}
          </section>

          {/* Deadline Soon */}
          {deadlineSoon.length > 0 && (
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Clock className="h-5 w-5 text-red-500" />
                  마감 임박
                </h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {deadlineSoon.map((grant) => (
                  <div key={grant.id} className="w-72 flex-shrink-0">
                    <GrantCard grant={grant} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent Viewed */}
          {recentGrants.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
                <Eye className="h-5 w-5 text-gray-500" />
                최근 본 과제
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentGrants.map((grant) => (
                  <GrantCard key={grant.id} grant={grant} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
