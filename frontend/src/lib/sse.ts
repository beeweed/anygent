/**
 * Minimal browser SSE parser built on top of `fetch` + `ReadableStream`.
 *
 * We use `fetch` instead of the native `EventSource` because:
 *   - `EventSource` only supports GET, while our `/api/chat` endpoint is POST
 *     (carrying the conversation history and the API key).
 *   - We need to cancel mid-stream via `AbortController`.
 */

export interface ParsedSSEEvent {
  event: string;
  data: string;
}

export async function* parseSSE(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<ParsedSSEEvent, void, unknown> {
  if (!response.body) {
    throw new Error("Response has no body.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines (\n\n)
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseEventBlock(raw);
        if (ev) yield ev;
      }
    }
    // Flush any trailing event in the buffer
    if (buffer.trim()) {
      const ev = parseEventBlock(buffer);
      if (ev) yield ev;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

function parseEventBlock(block: string): ParsedSSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event: ")) {
      event = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6));
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
