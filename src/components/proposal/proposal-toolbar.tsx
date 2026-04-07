"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Save,
  Download,
  History,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Proposal } from "@/types/proposal";

export interface ProposalToolbarProps {
  proposal: Proposal;
  streaming: boolean;
  saving: boolean;
  dirty: boolean;
  onGenerateAll: () => void;
  onSave: () => void;
  onShowHistory: () => void;
}

export function ProposalToolbar(props: ProposalToolbarProps) {
  const { proposal, streaming, saving, dirty, onGenerateAll, onSave, onShowHistory } = props;
  const filledCount = Object.keys(proposal.sections ?? {}).length;

  return (
    <div className="sticky top-14 z-30 -mx-4 mb-4 border-b bg-white/95 px-4 py-3 backdrop-blur md:top-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/proposals"
            className="mb-1 inline-flex items-center text-xs text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            목록
          </Link>
          <h1 className="truncate text-base font-semibold text-gray-900">
            {proposal.title}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
            <Badge variant="outline" className="text-[10px]">
              v{proposal.version}
            </Badge>
            <span>{filledCount}/7 섹션 작성됨</span>
            {proposal.costEstimateUsd > 0 && (
              <span>${proposal.costEstimateUsd.toFixed(3)}</span>
            )}
            {dirty && <span className="text-amber-600">● 저장 안 됨</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onShowHistory}
            disabled={streaming}
          >
            <History className="mr-1 h-3.5 w-3.5" />
            기록
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSave}
            disabled={streaming || saving || !dirty}
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            저장
          </Button>
          <a
            href={`/proposals/${proposal.id}/download?format=md`}
            target="_blank"
            rel="noopener"
            aria-disabled={streaming}
            className={`inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent ${
              streaming ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            .md
          </a>
          <a
            href={`/proposals/${proposal.id}/download?format=docx`}
            target="_blank"
            rel="noopener"
            aria-disabled={streaming}
            className={`inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent ${
              streaming ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            .docx
          </a>
          <Button size="sm" onClick={onGenerateAll} disabled={streaming}>
            {streaming ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            전체 생성
          </Button>
        </div>
      </div>
    </div>
  );
}
