"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { ChatMessageView } from "./chat-message";
import { MAX_ITERATIONS, useAgent } from "@/lib/use-agent";
import type { AgentSettings, UIMessage } from "@/lib/types";

interface Props {
  settings: AgentSettings;
  onOpenSettings: () => void;
}

export function ChatPanel({ settings, onOpenSettings }: Props) {
  const agent = useAgent({
    apiKey: settings.apiKey,
    model: settings.model,
    enableReasoning: settings.enableReasoning,
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages / streaming deltas.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.messages]);

  // Build a lookup: tool_call_id → { content, status } so the assistant
  // bubble can show the inline tool result next to its chip.
  const toolResults = useMemo(() => {
    const m = new Map<string, { content: string; status: "success" | "error" }>();
    for (const msg of agent.messages) {
      if (msg.role === "tool" && msg.tool_call_id) {
        m.set(msg.tool_call_id, {
          content: msg.content,
          status: msg.tool_result_status ?? "success",
        });
      }
    }
    return m;
  }, [agent.messages]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || agent.running) return;
    const text = input;
    setInput("");
    await agent.send(text);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = (e.currentTarget.form as HTMLFormElement | null) ?? null;
      form?.requestSubmit();
    }
  };

  const placeholder = useMemo(() => {
    if (!settings.apiKey) return "Add your OpenRouter API key in Settings…";
    if (!settings.model) return "Select a model in Settings…";
    return "Describe what you want to build…";
  }, [settings.apiKey, settings.model]);

  const visible = agent.messages.filter(visibleInChat);

  return (
    <div className="flex flex-col h-full m-3 rounded-3xl border border-white/5 overflow-hidden bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-[var(--surface-3)] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-500/50 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Icon.Logo className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Vibe Coder</h1>
            <p className="text-[11px] text-zinc-500">
              {settings.model ? truncateModel(settings.model) : "Autonomous AI Agent"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {agent.running ? (
            <button
              type="button"
              onClick={agent.stop}
              title="Stop"
              className="p-2.5 rounded-xl text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition-all"
            >
              <Icon.Stop className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={agent.reset}
              title="Reset conversation"
              className="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all"
              disabled={agent.messages.length === 0}
            >
              <Icon.Reset className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all"
          >
            <Icon.Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-4"
      >
        {visible.length === 0 ? (
          <EmptyState
            hasApiKey={!!settings.apiKey}
            hasModel={!!settings.model}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          visible.map((m) => (
            <ChatMessageView key={m.id} message={m} toolResults={toolResults} />
          ))
        )}

        {agent.error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/8 text-sm text-rose-200">
            <Icon.Alert className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Agent error</div>
              <div className="text-xs text-rose-300/90 break-words">
                {agent.error}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 pt-2 pb-1 border-t border-white/5 bg-[var(--surface-3)] flex items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {agent.running ? "Working" : "Ready"}
        </span>
        <span className="text-[10px] text-zinc-600">·</span>
        <span className="text-[10px] text-zinc-500">
          Iter {agent.iteration}/{MAX_ITERATIONS}
        </span>
        <div className="ml-auto text-[10px] text-zinc-600">
          {settings.enableReasoning ? "reasoning on" : "reasoning off"}
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={onSubmit}
        className="px-4 pb-4 pt-2 bg-[var(--surface-3)]"
      >
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            rows={3}
            className="w-full min-h-[90px] max-h-[200px] bg-[#323234] rounded-2xl px-4 py-3 pr-14 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40 border border-transparent focus:border-indigo-500/30 transition-all"
            disabled={agent.running}
          />
          <button
            type="submit"
            disabled={!input.trim() || agent.running}
            className="absolute bottom-2.5 right-2.5 h-9 w-9 rounded-xl bg-[var(--primary)] hover:bg-indigo-500/90 disabled:bg-zinc-700 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 active:scale-[0.97]"
          >
            {agent.running ? (
              <Icon.Spinner className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Icon.Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
        <div className="mt-2 text-[10px] text-zinc-600 text-center">
          Press <kbd className="px-1 py-0.5 rounded bg-white/5">Enter</kbd> to
          send, <kbd className="px-1 py-0.5 rounded bg-white/5">Shift+Enter</kbd>{" "}
          for newline
        </div>
      </form>
    </div>
  );
}

function visibleInChat(m: UIMessage): boolean {
  // Tool messages are folded inline into the assistant bubble; system
  // messages are not user-facing.
  return m.role === "user" || m.role === "assistant";
}

function truncateModel(id: string): string {
  if (id.length <= 38) return id;
  const parts = id.split("/");
  if (parts.length >= 2) return `${parts[0]}/${parts.slice(1).join("/").slice(0, 28)}…`;
  return id.slice(0, 35) + "…";
}

interface EmptyProps {
  hasApiKey: boolean;
  hasModel: boolean;
  onOpenSettings: () => void;
}
function EmptyState({ hasApiKey, hasModel, onOpenSettings }: EmptyProps) {
  return (
    <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-cyan-500/20 flex items-center justify-center">
        <Icon.Logo className="w-7 h-7 text-indigo-300" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-100">
        Welcome to Vibe Coder
      </h2>
      <p className="text-sm text-zinc-400 mt-1 max-w-sm">
        An autonomous ReAct agent that writes and reads files in your browser
        via OpenRouter.
      </p>
      {(!hasApiKey || !hasModel) && (
        <button
          onClick={onOpenSettings}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium shadow-md shadow-indigo-500/20 hover:bg-indigo-500/90 transition-all"
        >
          <Icon.Settings className="w-4 h-4" />
          {!hasApiKey ? "Add API key" : "Select a model"}
        </button>
      )}
    </div>
  );
}
