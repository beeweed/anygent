/**
 * React hook that runs the ReAct loop on the client side.
 *
 * Architecture
 * ------------
 *   user message
 *     → POST /api/chat (full history)
 *     → backend streams SSE: reasoning → content → tool_call → assistant → done
 *     → if assistant emitted tool_calls:
 *           execute each call locally (browser FS),
 *           append `tool` messages to history,
 *           re-POST /api/chat (next iteration)
 *     → repeat until done with no tool_calls (or max iterations)
 *
 * The history sent to the backend is always plain OpenAI/OpenRouter shape
 * (system added server-side). The UI state is a richer projection.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat } from "./api";
import { executeToolCall } from "./file-system";
import type { ChatMessage, ToolCall, UIMessage } from "./types";

const MAX_ITERATIONS = 1000;

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseAgentArgs {
  apiKey: string;
  model: string;
  enableReasoning: boolean;
}

export interface UseAgentApi {
  messages: UIMessage[];
  running: boolean;
  iteration: number;
  error: string | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useAgent(args: UseAgentArgs): UseAgentApi {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [iteration, setIteration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // The canonical history that gets sent to the backend (OpenAI shape).
  const historyRef = useRef<ChatMessage[]>([]);

  // Keep latest args in a ref so the async loop reads fresh values without
  // re-creating the `send` callback on every keystroke.
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  }, [args]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    historyRef.current = [];
    setMessages([]);
    setIteration(0);
    setError(null);
    setRunning(false);
  }, []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (running) return;
    const { apiKey, model, enableReasoning } = argsRef.current;
    if (!apiKey) {
      setError("Add your OpenRouter API key in Settings first.");
      return;
    }
    if (!model) {
      setError("Select a model in Settings first.");
      return;
    }

    setError(null);
    setRunning(true);

    // Append user message to both UI state and canonical history.
    const userMsg: UIMessage = {
      id: uid(),
      role: "user",
      content: t,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: t },
    ];

    let iter = 0;
    try {
      // The ReAct loop. Each iteration is one model call. If the model
      // emits tool_calls, we execute them and continue. Otherwise the
      // assistant turn is final and we exit.
      while (iter < MAX_ITERATIONS) {
        iter += 1;
        setIteration(iter);

        // UI placeholder for the streaming assistant turn.
        const assistantId = uid();
        const placeholder: UIMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
          reasoning: "",
          streaming: true,
          thinking: true,
          iteration: iter,
          created_at: Date.now(),
        };
        setMessages((prev) => [...prev, placeholder]);

        const ac = new AbortController();
        abortRef.current = ac;

        let finalAssistantMessage: ChatMessage | null = null;
        const collectedToolCalls: ToolCall[] = [];
        let sawContentOrReasoning = false;
        let streamError: string | null = null;

        try {
          for await (const ev of streamChat({
            apiKey,
            model,
            enableReasoning,
            messages: historyRef.current,
            signal: ac.signal,
          })) {
            const data = ev.data ? JSON.parse(ev.data) : {};
            switch (ev.event) {
              case "start":
                break;
              case "reasoning": {
                sawContentOrReasoning = true;
                const delta = String(data.delta ?? "");
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          reasoning: (m.reasoning ?? "") + delta,
                          thinking: false,
                        }
                      : m,
                  ),
                );
                break;
              }
              case "content": {
                sawContentOrReasoning = true;
                const delta = String(data.delta ?? "");
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: (m.content ?? "") + delta,
                          thinking: false,
                        }
                      : m,
                  ),
                );
                break;
              }
              case "tool_call": {
                const tc: ToolCall = {
                  id: String(data.id ?? ""),
                  type: "function",
                  function: {
                    name: String(data.name ?? ""),
                    arguments: String(data.arguments ?? ""),
                  },
                };
                collectedToolCalls.push(tc);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          tool_calls: [...(m.tool_calls ?? []), tc],
                          thinking: false,
                        }
                      : m,
                  ),
                );
                break;
              }
              case "assistant": {
                finalAssistantMessage = data.message as ChatMessage;
                break;
              }
              case "done": {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          streaming: false,
                          thinking: false,
                          finish_reason: String(data.finish_reason ?? ""),
                        }
                      : m,
                  ),
                );
                break;
              }
              case "error": {
                streamError = String(data.message ?? "Unknown error");
                break;
              }
              default:
                break;
            }
          }
        } catch (e: unknown) {
          if ((e as { name?: string })?.name === "AbortError") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false, thinking: false }
                  : m,
              ),
            );
            return;
          }
          streamError = e instanceof Error ? e.message : String(e);
        } finally {
          abortRef.current = null;
        }

        if (streamError) {
          setError(streamError);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, streaming: false, thinking: false }
                : m,
            ),
          );
          return;
        }

        // Append the assistant message to the canonical history. If the
        // backend didn't emit one (shouldn't happen), reconstruct it.
        const assistantForHistory: ChatMessage =
          finalAssistantMessage ?? {
            role: "assistant",
            content: sawContentOrReasoning ? "" : null,
            tool_calls: collectedToolCalls.length ? collectedToolCalls : undefined,
          };
        historyRef.current = [...historyRef.current, assistantForHistory];

        // No tool calls → assistant turn is final, exit the loop.
        if (!collectedToolCalls.length) {
          return;
        }

        // ---------- Execute tool calls in the browser ---------- #
        for (const tc of collectedToolCalls) {
          const { content: result, status } = executeToolCall(
            tc.function.name,
            tc.function.arguments,
          );

          // Add a `tool` UI message for the chip + observation display.
          const toolUIMsg: UIMessage = {
            id: uid(),
            role: "tool",
            content: result,
            tool_call_id: tc.id,
            tool_name: tc.function.name,
            tool_result_status: status,
            created_at: Date.now(),
          };
          setMessages((prev) => [...prev, toolUIMsg]);

          // Add the tool message to canonical history for the next turn.
          historyRef.current = [
            ...historyRef.current,
            {
              role: "tool",
              content: result,
              tool_call_id: tc.id,
              name: tc.function.name,
            },
          ];
        }
        // Loop continues — the next iteration sends history (now containing
        // tool results) back to the LLM so it can decide the next step.
      }

      if (iter >= MAX_ITERATIONS) {
        setError(
          `Reached max iterations (${MAX_ITERATIONS}). Stopping the agent.`,
        );
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running]);

  // Abort any in-flight request when the hook unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { messages, running, iteration, error, send, stop, reset };
}

export { MAX_ITERATIONS };
