"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ChevronsUpDown,
  ChevronsRightLeft,
  Wand2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  SECTION_HINTS,
  SECTION_LABELS,
  type ProposalSection,
  type ProposalSectionKey,
} from "@/types/proposal";

export interface SectionEditorProps {
  sectionKey: ProposalSectionKey;
  section: ProposalSection | undefined;
  /** Live streaming text (overrides section.content while present). */
  streamingDelta: string | undefined;
  /** True if any stream is currently in flight. */
  streaming: boolean;
  /** True if THIS section is currently the active streamed section. */
  isActive: boolean;
  onChange: (content: string) => void;
  onRegenerate: (
    mode: "regenerate" | "refine" | "shorten" | "expand",
    feedback?: string
  ) => void;
}

export function SectionEditor(props: SectionEditorProps) {
  const {
    sectionKey,
    section,
    streamingDelta,
    streaming,
    isActive,
    onChange,
    onRegenerate,
  } = props;

  const [refineMode, setRefineMode] = useState(false);
  const [feedback, setFeedback] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const liveContent =
    streamingDelta !== undefined ? streamingDelta : section?.content ?? "";

  // Auto-grow textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 1200)}px`;
  }, [liveContent]);

  const handleSubmitRefine = () => {
    if (!feedback.trim()) return;
    onRegenerate("refine", feedback.trim());
    setFeedback("");
    setRefineMode(false);
  };

  return (
    <section
      id={`section-${sectionKey}`}
      className="scroll-mt-20 rounded-lg border border-gray-200 bg-white p-5"
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {SECTION_LABELS[sectionKey]}
            </h2>
            {section?.userEdited && (
              <Badge variant="outline" className="text-[10px]">
                직접 편집됨
              </Badge>
            )}
            {isActive && (
              <Badge className="bg-blue-100 text-blue-700">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                생성 중
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">{SECTION_HINTS[sectionKey]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={streaming || !section}
            onClick={() => onRegenerate("regenerate")}
            title="처음부터 새로 작성"
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            재생성
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={streaming || !section}
            onClick={() => setRefineMode((v) => !v)}
            title="피드백을 주고 수정"
          >
            <Wand2 className="mr-1 h-3.5 w-3.5" />
            수정 요청
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={streaming || !section}
            onClick={() => onRegenerate("shorten")}
            title="60% 분량으로 축소"
          >
            <ChevronsRightLeft className="mr-1 h-3.5 w-3.5" />
            줄이기
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={streaming || !section}
            onClick={() => onRegenerate("expand")}
            title="1.5배 분량으로 확장"
          >
            <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
            늘리기
          </Button>
        </div>
      </header>

      {refineMode && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-medium text-amber-900">
            어떤 부분을 어떻게 고칠까요?
          </p>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="예: 시장 규모 부분에 구체적인 수치를 추가해주세요."
            rows={3}
            className="bg-white"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRefineMode(false);
                setFeedback("");
              }}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitRefine}
              disabled={!feedback.trim() || streaming}
            >
              수정 요청
            </Button>
          </div>
        </div>
      )}

      <Textarea
        ref={taRef}
        value={liveContent}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isActive
            ? "AI가 작성 중입니다..."
            : "아직 생성되지 않았습니다. 위의 ‘재생성’ 또는 상단 ‘전체 생성’을 눌러주세요."
        }
        readOnly={isActive}
        rows={12}
        className="w-full resize-none font-mono text-sm leading-6"
      />

      {section && !isActive && (
        <p className="mt-2 text-[11px] text-gray-400">
          {section.model} · 입력 {section.tokens.input}t · 출력 {section.tokens.output}t
          · ${section.costUsd.toFixed(4)}
        </p>
      )}
    </section>
  );
}
