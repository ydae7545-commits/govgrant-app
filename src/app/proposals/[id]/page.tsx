"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProposalToolbar } from "@/components/proposal/proposal-toolbar";
import { SectionEditor } from "@/components/proposal/section-editor";
import { VersionHistory } from "@/components/proposal/version-history";
import { useProposalStream } from "@/hooks/use-proposal-stream";
import { featureFlags } from "@/lib/env";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  type Proposal,
  type ProposalSection,
  type ProposalSectionKey,
  type ProposalSections,
} from "@/types/proposal";

export default function ProposalEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: proposalId } = use(params);
  const searchParams = useSearchParams();
  const autostart = searchParams.get("autostart") === "1";

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<Set<ProposalSectionKey>>(
    () => new Set()
  );
  const [historyOpen, setHistoryOpen] = useState(false);

  const stream = useProposalStream();
  const autostartedRef = useRef(false);

  const fetchProposal = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}`);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/auth/sign-in?redirectTo=/proposals/${proposalId}`;
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { proposal: Proposal };
      setProposal(json.proposal);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    if (!featureFlags.useProposalAi) {
      setLoading(false);
      return;
    }
    void fetchProposal();
  }, [fetchProposal]);

  // Auto-start full generation when arrived from /proposals/new
  useEffect(() => {
    if (!autostart || !proposal || autostartedRef.current) return;
    if (Object.keys(proposal.sections ?? {}).length > 0) return;
    autostartedRef.current = true;
    void stream.start({
      url: `/api/proposals/${proposal.id}/generate`,
      onAllDone: () => {
        void fetchProposal();
      },
    });
  }, [autostart, proposal, fetchProposal, stream]);

  const handleSectionChange = (key: ProposalSectionKey, content: string) => {
    setProposal((p) => {
      if (!p) return p;
      const cur = p.sections[key];
      const next: ProposalSection = cur
        ? { ...cur, content, userEdited: true }
        : {
            content,
            generatedAt: new Date().toISOString(),
            model: "manual",
            tokens: { input: 0, output: 0 },
            costUsd: 0,
            userEdited: true,
          };
      return { ...p, sections: { ...p.sections, [key]: next } };
    });
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!proposal || dirtyKeys.size === 0) return;
    setSaving(true);
    try {
      const sectionsPayload: ProposalSections = {};
      for (const k of dirtyKeys) {
        const cur = proposal.sections[k];
        if (cur) sectionsPayload[k] = cur;
      }
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sections: sectionsPayload,
          markEdited: Array.from(dirtyKeys),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { proposal: Proposal };
      setProposal(json.proposal);
      setDirtyKeys(new Set());
    } catch (err) {
      alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAll = () => {
    if (!proposal) return;
    void stream.start({
      url: `/api/proposals/${proposal.id}/generate`,
      onSectionDone: () => {
        void fetchProposal();
      },
      onAllDone: () => {
        void fetchProposal();
      },
    });
  };

  const handleSectionRegenerate = (
    key: ProposalSectionKey,
    mode: "regenerate" | "refine" | "shorten" | "expand",
    feedback?: string
  ) => {
    if (!proposal) return;
    void stream.start({
      url: `/api/proposals/${proposal.id}/sections/${key}`,
      body: { mode, feedback },
      onAllDone: () => {
        void fetchProposal();
      },
    });
  };

  const handleRestore = async (sections: ProposalSections) => {
    if (!proposal) return;
    if (!confirm("이 버전으로 복원하시겠어요? 현재 작성본은 새 버전으로 저장됩니다.")) {
      return;
    }
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchProposal();
      setHistoryOpen(false);
      setDirtyKeys(new Set());
    } catch (err) {
      alert(`복원 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (!featureFlags.useProposalAi) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-gray-600">기능이 비활성화되어 있습니다.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm text-gray-500">
        불러오는 중...
      </div>
    );
  }

  if (loadError || !proposal) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-red-600">
          불러오기 실패: {loadError ?? "not_found"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <ProposalToolbar
        proposal={proposal}
        streaming={stream.streaming}
        saving={saving}
        dirty={dirtyKeys.size > 0}
        onGenerateAll={handleGenerateAll}
        onSave={handleSave}
        onShowHistory={() => setHistoryOpen(true)}
      />

      {stream.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⚠ {stream.error}
        </div>
      )}

      {/* Mini outline nav (sticky on desktop) */}
      <nav className="mb-4 flex flex-wrap gap-1.5">
        {SECTION_ORDER.map((k) => {
          const filled = !!proposal.sections[k];
          return (
            <a
              key={k}
              href={`#section-${k}`}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                filled
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {SECTION_LABELS[k]}
            </a>
          );
        })}
      </nav>

      <div className="space-y-4">
        {SECTION_ORDER.map((key) => (
          <SectionEditor
            key={key}
            sectionKey={key}
            section={proposal.sections[key]}
            streamingDelta={stream.partials[key]}
            streaming={stream.streaming}
            isActive={stream.activeSection === key}
            onChange={(content) => handleSectionChange(key, content)}
            onRegenerate={(mode, feedback) =>
              handleSectionRegenerate(key, mode, feedback)
            }
          />
        ))}
      </div>

      <VersionHistory
        proposalId={proposalId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestore}
      />
    </div>
  );
}
