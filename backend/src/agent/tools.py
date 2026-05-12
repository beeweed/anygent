"""
Tool registry and schemas for the ReAct agent.

The tools are defined as JSON schemas compatible with the OpenAI / OpenRouter
native function calling API. The actual execution of these tools happens on the
client (browser) side because file storage lives in the browser (localStorage /
IndexedDB). The backend's job is to:

1. Advertise the tool schemas to the LLM via `tools` parameter.
2. Forward the structured tool_calls produced by the model back to the
   frontend via SSE so the frontend can execute them.
3. Receive the tool result back from the frontend and append it to the
   conversation as a `role: "tool"` message, then resume the loop.

This module is the SINGLE source of truth for tool schemas. Adding a new tool
here automatically exposes it to the agent — no other code needs to change.
"""

from __future__ import annotations

from typing import Any, Dict, List


# ----------------------------------------------------------------------------
# Tool schemas (OpenAI / OpenRouter native function calling format)
# ----------------------------------------------------------------------------

FILE_WRITE_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "file_write",
        "description": (
            "Create or overwrite a file at the given path inside the sandbox. "
            "Use for creating new files or fully rewriting existing ones."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": (
                        "Absolute path starting with /home/user/. "
                        "Example: /home/user/project/src/App.tsx"
                    ),
                },
                "content": {
                    "type": "string",
                    "description": "The full content to write to the file.",
                },
            },
            "required": ["file_path", "content"],
        },
    },
}


FILE_READ_TOOL: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "file_read",
        "description": (
            "Read the content of an existing file from the sandbox. "
            "Returns content with line numbers."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": (
                        "Absolute path starting with /home/user/. "
                        "Example: /home/user/project/src/main.py"
                    ),
                }
            },
            "required": ["file_path"],
        },
    },
}


ALL_TOOLS: List[Dict[str, Any]] = [FILE_WRITE_TOOL, FILE_READ_TOOL]


def get_tools() -> List[Dict[str, Any]]:
    """Return the tool registry as a list of OpenAI-format tool schemas."""
    return ALL_TOOLS


def tool_names() -> List[str]:
    return [t["function"]["name"] for t in ALL_TOOLS]
