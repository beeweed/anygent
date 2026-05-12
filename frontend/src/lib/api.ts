/**
 * Frontend → Backend API client.
 *
 * The backend URL is configured via `NEXT_PUBLIC_BACKEND_URL` so the
 * frontend can be deployed independently of the backend.
 */

import type { ChatMessage, ModelInfo } from "./types";
import { parseSSE, type ParsedSSEEvent } from "./sse";

const DEFAULT_BACKEND = "http://localhost:8000";

export function backendUrl(): string {
  if (typeof window !== "undefined") {
    const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL;
    return (fromEnv && fromEnv.trim()) || DEFAULT_BACKEND;
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND;
}

export async function fetchModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(`${backendUrl()}/api/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to load models (${res.status}): ${body || res.statusText}`,
    );
  }
  const data = (await res.json()) as { models: ModelInfo[] };
  return data.models;
}

export interface StreamChatArgs {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  enableReasoning: boolean;
  systemPrompt?: string;
  signal?: AbortSignal;
}

export async function* streamChat(
  args: StreamChatArgs,
): AsyncGenerator<ParsedSSEEvent, void, unknown> {
  const res = await fetch(`${backendUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      api_key: args.apiKey,
      model: args.model,
      messages: args.messages,
      enable_reasoning: args.enableReasoning,
      system_prompt: args.systemPrompt,
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Chat request failed (${res.status}): ${body || res.statusText}`,
    );
  }

  yield* parseSSE(res, args.signal);
}
