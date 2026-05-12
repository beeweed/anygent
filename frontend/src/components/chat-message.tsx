"use client";

import { Icon } from "./icons";
import { MessageMarkdown } from "./message-markdown";
import { ReasoningBlock } from "./reasoning-block";
import { ThinkingIndicator } from "./thinking-indicator";
import { ToolChip } from "./tool-chip";
import type { UIMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  message: UIMessage;
  toolResults: Map<string, { content: string; status: "success" | "error" }>;
}

export function ChatMessageView({ message, toolResults }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex gap-3 justify-end animate-fade-in">
        <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-[var(--primary)] text-white shadow-lg shadow-indigo-500/10">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
          <svg
            className="w-4 h-4 text-indigo-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    // Tool result is rendered inline next to the matching assistant tool-call
    // chip (see assistant branch below). We swallow standalone tool messages
    // here to avoid duplication.
    return null;
  }

  if (message.role !== "assistant") return null;

  const showThinking =
    !!message.thinking &&
    !message.content &&
    !message.reasoning &&
    !(message.tool_calls && message.tool_calls.length);

  return (
    <div className="flex gap-3 animate-fade-in">
      <div
        className={cn(
          "w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/25 to-cyan-500/20 flex items-center justify-center shrink-0",
          message.streaming && "animate-pulse-glow",
        )}
      >
        <Icon.Logo className="w-4 h-4 text-indigo-300" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300">Vibe Coder</span>
          {message.iteration && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-medium text-indigo-300">
              <span className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
              Iter {message.iteration}
            </span>
          )}
        </div>

        {showThinking && <ThinkingIndicator />}

        {message.reasoning && (
          <ReasoningBlock
            text={message.reasoning}
            streaming={message.streaming}
          />
        )}

        {message.content && (
          <div className="text-sm leading-relaxed text-zinc-200">
            <MessageMarkdown text={message.content} />
            {message.streaming && !message.tool_calls?.length && (
              <span className="caret align-middle" />
            )}
          </div>
        )}

        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {message.tool_calls.map((tc) => {
              const tr = toolResults.get(tc.id);
              const status: "running" | "success" | "error" = tr
                ? tr.status
                : message.streaming
                  ? "running"
                  : "running";
              return (
                <ToolChip
                  key={tc.id}
                  name={tc.function.name}
                  argsRaw={tc.function.arguments}
                  status={status}
                  result={tr?.content}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
