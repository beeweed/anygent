"""
OpenRouter HTTP client.

Pure server-side calls to OpenRouter. The API key is sent by the user from the
frontend with every request (never persisted on the server). All third-party
provider abstraction lives here, so adding another provider only requires
implementing a similar service module.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT = httpx.Timeout(connect=15.0, read=300.0, write=60.0, pool=15.0)


class OpenRouterError(Exception):
    """Raised when OpenRouter returns a non-2xx response."""

    def __init__(self, status_code: int, message: str, payload: Any = None):
        super().__init__(f"OpenRouter {status_code}: {message}")
        self.status_code = status_code
        self.message = message
        self.payload = payload


class OpenRouterClient:
    """
    Stateless async client. One instance per app is fine; httpx.AsyncClient is
    thread/coroutine-safe and connection-pooled.
    """

    def __init__(self, http_referer: str = "https://vibe-coder.local", app_title: str = "Vibe Coder"):
        self._http_referer = http_referer
        self._app_title = app_title
        self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, http2=False)

    async def close(self) -> None:
        await self._client.aclose()

    # ---------------------------------------------------------------------- #
    # Public API                                                             #
    # ---------------------------------------------------------------------- #
    async def list_models(self, api_key: str) -> List[Dict[str, Any]]:
        """List all models available to this OpenRouter account."""
        resp = await self._client.get(
            f"{OPENROUTER_BASE_URL}/models",
            headers=self._headers(api_key),
        )
        if resp.status_code >= 400:
            raise OpenRouterError(resp.status_code, resp.text, _safe_json(resp))
        data = resp.json()
        return data.get("data", [])

    async def stream_chat(
        self,
        api_key: str,
        model: str,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        reasoning: Optional[Dict[str, Any]] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Stream a chat completion from OpenRouter. Yields parsed SSE JSON
        deltas. Caller is responsible for accumulating tool_call argument
        deltas across chunks.
        """
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if reasoning is not None:
            # Enable reasoning channel when supported (Anthropic / OpenAI o-series /
            # DeepSeek / etc.). OpenRouter normalizes this for many providers.
            payload["reasoning"] = reasoning
        if extra:
            payload.update(extra)

        async with self._client.stream(
            "POST",
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers=self._headers(api_key),
            json=payload,
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise OpenRouterError(
                    resp.status_code,
                    body.decode("utf-8", errors="replace"),
                )

            async for line in resp.aiter_lines():
                if not line:
                    continue
                # OpenRouter (and OpenAI) prefix data lines with "data: ".
                # Comment lines start with ":" and can be ignored (SSE keep-alives).
                if line.startswith(":"):
                    continue
                if not line.startswith("data: "):
                    continue
                data_str = line[len("data: "):].strip()
                if data_str == "[DONE]":
                    return
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    # Some providers occasionally emit non-JSON keep-alive payloads.
                    continue
                yield chunk

    # ---------------------------------------------------------------------- #
    # Helpers                                                                #
    # ---------------------------------------------------------------------- #
    def _headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Recommended OpenRouter headers (used for ranking on openrouter.ai/rankings)
            "HTTP-Referer": self._http_referer,
            "X-Title": self._app_title,
        }


def _safe_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return None
