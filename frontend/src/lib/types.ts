// Shared TypeScript types for the agent UI.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // serialized JSON
  };
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  context_length?: number;
  pricing?: Record<string, unknown>;
  supports_tools: boolean;
  supports_reasoning: boolean;
}

export interface VirtualFile {
  path: string;
  content: string;
  updated_at: number;
  created_at: number;
  size: number;
}

// UI-side message that drives rendering. Augments a chat history entry with
// per-turn UI state (streamed reasoning, tool activity chips, etc.).
export interface UIMessage {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // for tool-role messages
  tool_name?: string; // for tool-role messages
  tool_result_status?: "success" | "error";
  iteration?: number;
  streaming?: boolean;
  thinking?: boolean;
  finish_reason?: string;
  created_at: number;
}

export interface AgentSettings {
  apiKey: string;
  model: string;
  enableReasoning: boolean;
}

// SSE event payloads emitted by the backend.
export type AgentEvent =
  | { event: "start"; data: { turn_id: string; model: string } }
  | { event: "reasoning"; data: { delta: string } }
  | { event: "content"; data: { delta: string } }
  | {
      event: "tool_call";
      data: {
        id: string;
        name: string;
        arguments: string;
        parsed_arguments: unknown;
      };
    }
  | { event: "assistant"; data: { message: ChatMessage } }
  | {
      event: "done";
      data: { turn_id: string; finish_reason: string; elapsed_ms: number };
    }
  | { event: "error"; data: { message: string; status?: number } };
