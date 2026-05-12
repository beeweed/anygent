"""
FastAPI entrypoint.

Endpoints
---------
GET  /api/health              — liveness probe
POST /api/models              — list OpenRouter models for a given API key
POST /api/chat                — stream one ReAct agent turn over SSE
GET  /                        — basic info

The server is stateless. Each request carries the API key and full
conversation history, so the same instance can be horizontally scaled to
serve many concurrent SaaS users.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .agent.react_agent import MAX_ITERATIONS, run_agent_turn
from .agent.tools import get_tools, tool_names
from .services.openrouter import OpenRouterClient, OpenRouterError


# --------------------------------------------------------------------------- #
# App factory                                                                 #
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.openrouter = OpenRouterClient(
        http_referer=os.getenv("APP_PUBLIC_URL", "https://vibe-coder.local"),
        app_title=os.getenv("APP_TITLE", "Vibe Coder"),
    )
    try:
        yield
    finally:
        await app.state.openrouter.close()


app = FastAPI(title="Vibe Coder Agent API", version="1.0.0", lifespan=lifespan)

# Permissive CORS — the frontend talks to us from a different origin / port.
# In production behind the same domain this can be tightened to a list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Schemas                                                                     #
# --------------------------------------------------------------------------- #
class ModelsRequest(BaseModel):
    api_key: str = Field(..., min_length=1)


class ChatMessage(BaseModel):
    role: str
    content: Optional[Any] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    reasoning: Optional[str] = None

    def to_openai(self) -> Dict[str, Any]:
        """Project to the exact shape OpenRouter expects."""
        out: Dict[str, Any] = {"role": self.role}
        # content: tool messages and user/assistant messages need content
        if self.content is not None:
            out["content"] = self.content
        else:
            # For assistant messages with tool_calls, content may be None.
            if self.role == "assistant" and self.tool_calls:
                out["content"] = None
            elif self.role in ("user", "system"):
                out["content"] = ""
            else:
                out["content"] = ""
        if self.tool_calls:
            out["tool_calls"] = self.tool_calls
        if self.tool_call_id:
            out["tool_call_id"] = self.tool_call_id
        if self.name:
            out["name"] = self.name
        return out


class ChatRequest(BaseModel):
    api_key: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    messages: List[ChatMessage]
    enable_reasoning: bool = True
    system_prompt: Optional[str] = None


# --------------------------------------------------------------------------- #
# Routes                                                                      #
# --------------------------------------------------------------------------- #
@app.get("/")
async def root() -> Dict[str, Any]:
    return {
        "service": "Vibe Coder Agent API",
        "version": "1.0.0",
        "max_iterations": MAX_ITERATIONS,
        "tools": tool_names(),
        "endpoints": ["/api/health", "/api/models", "/api/chat"],
    }


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"ok": True, "tools": tool_names(), "max_iterations": MAX_ITERATIONS}


@app.get("/api/tools")
async def tools() -> Dict[str, Any]:
    return {"tools": get_tools()}


@app.post("/api/models")
async def list_models(req: ModelsRequest, request: Request) -> JSONResponse:
    client: OpenRouterClient = request.app.state.openrouter
    try:
        models = await client.list_models(req.api_key)
    except OpenRouterError as e:
        return JSONResponse(
            {"error": e.message, "status": e.status_code},
            status_code=e.status_code if 400 <= e.status_code < 600 else 502,
        )
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": f"Internal error: {e}"}, status_code=500)

    # Light projection — keep payload small and stable for the UI.
    projected = []
    for m in models:
        params = m.get("supported_parameters") or []
        projected.append(
            {
                "id": m.get("id"),
                "name": m.get("name") or m.get("id"),
                "description": m.get("description") or "",
                "context_length": m.get("context_length"),
                "pricing": m.get("pricing"),
                "supports_tools": "tools" in params,
                "supports_reasoning": ("reasoning" in params) or ("include_reasoning" in params),
            }
        )
    # Stable ordering: tool-capable models first, then by id.
    projected.sort(key=lambda x: (not x["supports_tools"], x["id"] or ""))
    return JSONResponse({"models": projected})


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request) -> StreamingResponse:
    client: OpenRouterClient = request.app.state.openrouter
    history = [m.to_openai() for m in req.messages]

    async def event_stream():
        async for sse in run_agent_turn(
            client=client,
            api_key=req.api_key,
            model=req.model,
            history=history,
            enable_reasoning=req.enable_reasoning,
            system_prompt=req.system_prompt,
        ):
            yield sse

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
