"""Unit tests for ReAct agent helpers (no network)."""

import json
from ..agent.react_agent import (
    StreamState,
    ToolCallAccumulator,
    build_messages,
    _sse,
)
from ..agent.prompts import REACT_SYSTEM_PROMPT


def test_build_messages_prepends_system_prompt():
    msgs = build_messages(None, [{"role": "user", "content": "hi"}])
    assert msgs[0]["role"] == "system"
    assert REACT_SYSTEM_PROMPT.strip() in msgs[0]["content"]
    assert msgs[1] == {"role": "user", "content": "hi"}


def test_build_messages_with_custom_system_prompt():
    msgs = build_messages("custom", [{"role": "user", "content": "hi"}])
    assert msgs[0] == {"role": "system", "content": "custom"}


def test_tool_call_accumulator_to_dict():
    acc = ToolCallAccumulator(id="call_1", name="file_write", arguments='{"a":1}')
    d = acc.to_dict()
    assert d["id"] == "call_1"
    assert d["type"] == "function"
    assert d["function"]["name"] == "file_write"
    assert d["function"]["arguments"] == '{"a":1}'


def test_stream_state_assistant_message_text_only():
    s = StreamState(content="Hello")
    msg = s.assistant_message()
    assert msg["role"] == "assistant"
    assert msg["content"] == "Hello"
    assert "tool_calls" not in msg


def test_stream_state_assistant_message_with_tool_calls():
    s = StreamState()
    acc = s.ensure_tool_call(0)
    acc.id = "call_1"
    acc.name = "file_write"
    acc.arguments = '{"file_path":"/home/user/x","content":"y"}'
    msg = s.assistant_message()
    assert msg["role"] == "assistant"
    assert msg["content"] is None
    assert msg["tool_calls"][0]["function"]["name"] == "file_write"


def test_sse_format():
    out = _sse("content", {"delta": "hi"})
    assert out.startswith("event: content\n")
    assert "data: " in out
    assert out.endswith("\n\n")
    # data line must be valid JSON
    data_line = [ln for ln in out.split("\n") if ln.startswith("data: ")][0]
    assert json.loads(data_line[len("data: "):]) == {"delta": "hi"}
