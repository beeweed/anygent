"""
ReAct agent core.

This module implements the streaming ReAct loop:

    Thought (reasoning channel)
      → Action (native tool_call from the API)
      → Observation (tool result, supplied by the client/frontend)
      → Repeat
      → Final Answer

Architecture notes
------------------
* Tools (`file_write`, `file_read`) are executed in the browser, because file
  storage lives in browser local storage. The backend therefore:
    1. Streams the model's reasoning and content tokens as SSE events.
    2. When the model emits a `tool_call`, the backend pauses, emits a
       `tool_call` SSE event to the frontend, and waits for the frontend to
       POST the tool result back into the same conversation (via the
       `tool_results` field on the next `/api/chat` request).
* The frontend therefore drives the iteration: it sends the full message
  history (including prior assistant tool_calls and the tool results it just
  executed) on each `/api/chat` call. The backend is stateless, which makes
  the system trivially horizontally scalable — exactly what's required for a
  multi-tenant SaaS.
* Safeguard: `MAX_ITERATIONS = 1000` is enforced on the frontend (per
  conversation) AND on the backend (per single HTTP request, the number of
  consecutive non-tool-paused model turns, which is always 1 for this
  architecture). The hard ceiling here just guards against pathological input.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional

from .prompts import REACT_SYSTEM_PROMPT
from .tools import get_tools
from ..services.openrouter import OpenRouterClient, OpenRouterError


MAX_ITERATIONS = 1000  # global hard ceiling (frontend enforces per-conversation)


@dataclass
class ToolCallAccumulator:
    """Accumulates streamed tool_call argument deltas into a complete call."""

    id: str = ""
    name: str = ""
    arguments: str = ""
    index: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": self.arguments,
            },
        }


@dataclass
class StreamState:
    """Aggregates the partial assistant message being constructed from the stream."""

    content: str = ""
    reasoning: str = ""
    tool_calls: Dict[int, ToolCallAccumulator] = field(default_factory=dict)
    finish_reason: Optional[str] = None

    def ensure_tool_call(self, index: int) -> ToolCallAccumulator:
        if index not in self.tool_calls:
            self.tool_calls[index] = ToolCallAccumulator(index=index)
        return self.tool_calls[index]

    def has_tool_calls(self) -> bool:
        return bool(self.tool_calls)

    def assistant_message(self) -> Dict[str, Any]:
        msg: Dict[str, Any] = {"role": "assistant"}
        # Per OpenAI spec: when tool_calls is present, content may be null.
        msg["content"] = self.content if self.content else None
        if self.tool_calls:
            ordered = sorted(self.tool_calls.values(), key=lambda c: c.index)
            msg["tool_calls"] = [tc.to_dict() for tc in ordered]
        if self.reasoning:
            # Keep reasoning around for client display; harmless if the next
            # model call ignores it.
            msg["reasoning"] = self.reasoning
        return msg


def _sse(event: str, data: Dict[str, Any]) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def build_messages(
    system_prompt: Optional[str],
    history: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Prepend the system prompt to the conversation history. The frontend sends
    a clean history containing only user / assistant / tool messages.
    """
    prompt = (system_prompt or REACT_SYSTEM_PROMPT).strip()
    out: List[Dict[str, Any]] = [{"role": "system", "content": prompt}]
    out.extend(history)
    return out


async def run_agent_turn(
    client: OpenRouterClient,
    api_key: str,
    model: str,
    history: List[Dict[str, Any]],
    enable_reasoning: bool = True,
    system_prompt: Optional[str] = None,
) -> AsyncIterator[str]:
    """
    Execute ONE turn of the ReAct loop and stream SSE events to the caller.

    A "turn" runs the model exactly once. If the model emits tool calls, the
    loop pauses, emits the tool calls to the frontend, and ends. The frontend
    is expected to execute the tools and POST a new request with the appended
    `tool` messages, which restarts the loop. This is the right shape because:

    * The actual tools execute in the browser (local storage), so the backend
      cannot continue without the frontend's output anyway.
    * Stateless backend → horizontally scalable SaaS.
    * The user sees real-time streaming and clean Thought → Action →
      Observation transitions in the UI.

    Yields SSE-formatted strings:
      - event: start        — turn started
      - event: reasoning    — reasoning delta (model thinking)
      - event: content      — text content delta
      - event: tool_call    — a fully-assembled tool call ready to execute
      - event: assistant    — the final assistant message object for the
                              frontend to append verbatim to history
      - event: done         — turn finished (finish_reason included)
      - event: error        — fatal error
    """
    turn_id = uuid.uuid4().hex
    started_at = time.time()

    # ---- Sanity-check inputs --------------------------------------------- #
    if not api_key:
        yield _sse("error", {"message": "Missing OpenRouter API key."})
        return
    if not model:
        yield _sse("error", {"message": "No model selected."})
        return

    yield _sse("start", {"turn_id": turn_id, "model": model})

    messages = build_messages(system_prompt, history)
    tools = get_tools()

    # Reasoning: ask OpenRouter to surface the reasoning channel. Models that
    # don't support it ignore the field.
    reasoning_param: Optional[Dict[str, Any]] = (
        {"effort": "medium"} if enable_reasoning else None
    )

    state = StreamState()

    try:
        async for chunk in client.stream_chat(
            api_key=api_key,
            model=model,
            messages=messages,
            tools=tools,
            reasoning=reasoning_param,
        ):
            # Mid-stream provider error (OpenRouter surfaces these as an
            # `error` field at the top level of the chunk).
            if isinstance(chunk, dict) and chunk.get("error"):
                err = chunk["error"]
                msg = err.get("message") if isinstance(err, dict) else str(err)
                yield _sse("error", {"message": msg or "Provider error."})
                return

            choices = chunk.get("choices") or []
            if not choices:
                continue
            choice = choices[0]
            delta = choice.get("delta") or {}

            # Reasoning tokens (Anthropic, OpenAI o-series, DeepSeek-R1, …)
            r_delta = delta.get("reasoning") or delta.get("reasoning_content")
            if r_delta:
                state.reasoning += r_delta
                yield _sse("reasoning", {"delta": r_delta})

            # Plain content tokens
            c_delta = delta.get("content")
            if c_delta:
                state.content += c_delta
                yield _sse("content", {"delta": c_delta})

            # Tool call deltas
            tc_deltas = delta.get("tool_calls") or []
            for tc in tc_deltas:
                idx = tc.get("index", 0)
                acc = state.ensure_tool_call(idx)
                if tc.get("id"):
                    acc.id = tc["id"]
                fn = tc.get("function") or {}
                if fn.get("name"):
                    acc.name = fn["name"]
                args_delta = fn.get("arguments")
                if args_delta:
                    acc.arguments += args_delta

            # finish_reason arrives on the final chunk
            if choice.get("finish_reason"):
                state.finish_reason = choice["finish_reason"]

    except OpenRouterError as e:
        yield _sse("error", {"message": e.message, "status": e.status_code})
        return
    except Exception as e:  # noqa: BLE001 — surface any error to the client
        yield _sse("error", {"message": f"Internal error: {e}"})
        return

    # ----------------------------------------------------------------- #
    # Emit fully-formed tool calls (one event per tool call)            #
    # ----------------------------------------------------------------- #
    if state.has_tool_calls():
        for acc in sorted(state.tool_calls.values(), key=lambda c: c.index):
            # Best-effort parse of the assembled JSON arguments — failure is
            # not fatal; the frontend will receive the raw string.
            parsed_args: Any = None
            try:
                parsed_args = json.loads(acc.arguments) if acc.arguments else {}
            except json.JSONDecodeError:
                parsed_args = None
            yield _sse(
                "tool_call",
                {
                    "id": acc.id,
                    "name": acc.name,
                    "arguments": acc.arguments,
                    "parsed_arguments": parsed_args,
                },
            )

    # The complete assistant message — the frontend appends this verbatim
    # to its conversation history before sending the next request.
    yield _sse("assistant", {"message": state.assistant_message()})

    yield _sse(
        "done",
        {
            "turn_id": turn_id,
            "finish_reason": state.finish_reason or ("tool_calls" if state.has_tool_calls() else "stop"),
            "elapsed_ms": int((time.time() - started_at) * 1000),
        },
    )
