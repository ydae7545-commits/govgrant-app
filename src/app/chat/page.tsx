"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { GrantCard } from "@/components/grant/grant-card";
import { useUserStore } from "@/store/user-store";
import { mockGrants } from "@/data/mock-grants";
import type { Grant } from "@/types/grant";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  relatedGrantIds?: string[];
  suggestions?: string[];
}

export default function ChatPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const account = useUserStore((s) => s.account);
  const getActiveContext = useUserStore((s) => s.getActiveContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initial greeting
  useEffect(() => {
    if (!mounted) return;
    setMessages([
      {
        id: "init",
        role: "bot",
        content:
          "안녕하세요! 정부지원금 추천 도우미입니다. 개인, 중소기업, 연구기관 등 사용자 유형에 맞는 지원금과 R&D 과제를 찾아드립니다. 어떤 도움이 필요하신가요?",
        suggestions: [
          "어떤 지원금을 받을 수 있나요?",
          "창업 지원 프로그램 알려줘",
          "R&D 과제 추천해줘",
        ],
      },
    ]);
  }, [mounted]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 활성 컨텍스트에서 사용자 유형 추론 (개인 복지 → individual, 기관 → sme/research 등)
      const ctx = getActiveContext();
      let profileType: string | undefined;
      if (ctx?.kind === "personal") {
        profileType = "individual";
      } else if (ctx?.kind === "org") {
        if (ctx.org.kind === "sme" || ctx.org.kind === "sole")
          profileType = "sme";
        else if (ctx.org.kind === "research") profileType = "research";
      }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          profileType,
        }),
      });
      const data = await res.json();

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        role: "bot",
        content: data.message,
        relatedGrantIds: data.relatedGrantIds,
        suggestions: data.suggestions,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-error-${Date.now()}`,
          role: "bot",
          content: "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.",
          suggestions: ["다시 시도"],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const getRelatedGrants = (ids?: string[]): Grant[] => {
    if (!ids || ids.length === 0) return [];
    return ids
      .map((id) => mockGrants.find((g) => g.id === id))
      .filter((g): g is Grant => !!g)
      .slice(0, 3);
  };

  if (!mounted)
    return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem-4rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div
                className={`flex gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "bot"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {msg.role === "bot" ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "bot"
                      ? "bg-gray-100 text-gray-800"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>
              </div>

              {/* Related Grants */}
              {msg.role === "bot" &&
                msg.relatedGrantIds &&
                msg.relatedGrantIds.length > 0 && (
                  <div className="ml-11 mt-3 space-y-2">
                    {getRelatedGrants(msg.relatedGrantIds).map((grant) => (
                      <GrantCard key={grant.id} grant={grant} />
                    ))}
                  </div>
                )}

              {/* Suggestions */}
              {msg.role === "bot" &&
                msg.suggestions &&
                msg.suggestions.length > 0 && (
                  <div className="ml-11 mt-3 flex flex-wrap gap-2">
                    {msg.suggestions.map((suggestion) => {
                      const navMap: Record<string, string> = {
                        "프로필 설정하러 가기": "/onboarding",
                        "프로필 수정하기": "/mypage",
                        "대시보드 보러 가기": "/dashboard",
                        "캘린더 보러 가기": "/calendar",
                        "마감 임박 과제 보기": "/search?sort=deadline",
                      };
                      const navTarget = navMap[suggestion];
                      return (
                        <button
                          key={suggestion}
                          onClick={() =>
                            navTarget
                              ? router.push(navTarget)
                              : sendMessage(suggestion)
                          }
                          className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-50"
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-gray-100 px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Bar */}
      <div className="border-t bg-white px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-2xl items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="궁금한 점을 물어보세요..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
