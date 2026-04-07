"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProposalSections } from "@/types/proposal";
import { SECTION_LABELS, SECTION_ORDER } from "@/types/proposal";

interface VersionRow {
  id: number;
  version: number;
  sections: ProposalSections;
  createdAt: string;
}

export interface VersionHistoryProps {
  proposalId: string;
  open: boolean;
  onClose: () => void;
  onRestore: (sections: ProposalSections) => void;
}

export function VersionHistory(props: VersionHistoryProps) {
  const { proposalId, open, onClose, onRestore } = props;
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/proposals/${proposalId}/versions`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { versions: VersionRow[] };
        if (!cancelled) setVersions(json.versions ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, proposalId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 bg-black/40"
        aria-label="닫기"
      />
      <aside className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">버전 기록</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-sm text-gray-500">불러오는 중...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : versions.length === 0 ? (
            <p className="text-center text-sm text-gray-500">
              아직 저장된 버전이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => {
                const filled = SECTION_ORDER.filter((k) => v.sections?.[k]);
                return (
                  <div
                    key={v.id}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant="outline">v{v.version}</Badge>
                        <span className="ml-2 text-xs text-gray-500">
                          {new Date(v.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRestore(v.sections)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        복원
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-500">
                      {filled.map((k) => SECTION_LABELS[k]).join(" · ") || "비어 있음"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
