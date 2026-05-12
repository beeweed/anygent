/**
 * Browser-backed virtual file system.
 *
 * The agent's `file_write` / `file_read` tools target absolute paths starting
 * with `/home/user/`. We persist them in `localStorage` under a single key so
 * the data survives reloads. For larger payloads (e.g., big images / many
 * files) we could swap this for IndexedDB without changing the public API.
 */

import type { VirtualFile } from "./types";

const STORAGE_KEY = "vibe.fs.v1";

type FSData = Record<string, VirtualFile>;

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readAll(): FSData {
  const s = safeStorage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FSData;
  } catch {
    return {};
  }
}

function writeAll(data: FSData): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // Quota exceeded — surface as an error to caller via thrown Error
    throw new Error(
      `Failed to persist file system: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function normalizePath(path: string): string {
  if (!path || typeof path !== "string") {
    throw new Error("file_path must be a non-empty string");
  }
  const trimmed = path.trim();
  if (!trimmed.startsWith("/home/user/")) {
    throw new Error(
      `file_path must be an absolute path starting with /home/user/. Got: ${trimmed}`,
    );
  }
  // Collapse any duplicate slashes
  return trimmed.replace(/\/+/g, "/");
}

/** Pure event channel so React components can subscribe to FS changes. */
type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export const FileSystem = {
  /** List all files sorted by path ascending. */
  list(): VirtualFile[] {
    const data = readAll();
    return Object.values(data).sort((a, b) => a.path.localeCompare(b.path));
  },

  read(path: string): VirtualFile | null {
    const p = normalizePath(path);
    const data = readAll();
    return data[p] ?? null;
  },

  write(path: string, content: string): VirtualFile {
    const p = normalizePath(path);
    const now = Date.now();
    const data = readAll();
    const prev = data[p];
    const file: VirtualFile = {
      path: p,
      content,
      created_at: prev?.created_at ?? now,
      updated_at: now,
      size: new Blob([content]).size,
    };
    data[p] = file;
    writeAll(data);
    notify();
    return file;
  },

  delete(path: string): boolean {
    const p = normalizePath(path);
    const data = readAll();
    if (!(p in data)) return false;
    delete data[p];
    writeAll(data);
    notify();
    return true;
  },

  clear(): void {
    writeAll({});
    notify();
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/**
 * Execute a tool call locally (in the browser) and produce the stringified
 * result to be sent back to the agent as a `tool` role message.
 *
 * Returns `{ content, status }` where `content` is what the LLM will see.
 */
export function executeToolCall(
  name: string,
  argsRaw: string,
): { content: string; status: "success" | "error" } {
  let args: Record<string, unknown> = {};
  try {
    args = argsRaw ? (JSON.parse(argsRaw) as Record<string, unknown>) : {};
  } catch (e) {
    return {
      content: JSON.stringify({
        ok: false,
        error: "INVALID_JSON_ARGUMENTS",
        message: `Tool arguments are not valid JSON: ${
          e instanceof Error ? e.message : String(e)
        }`,
      }),
      status: "error",
    };
  }

  try {
    if (name === "file_write") {
      const filePath = String(args.file_path ?? "");
      const content = String(args.content ?? "");
      const file = FileSystem.write(filePath, content);
      return {
        content: JSON.stringify({
          ok: true,
          file_path: file.path,
          bytes_written: file.size,
          message: "File written successfully.",
        }),
        status: "success",
      };
    }

    if (name === "file_read") {
      const filePath = String(args.file_path ?? "");
      const file = FileSystem.read(filePath);
      if (!file) {
        return {
          content: JSON.stringify({
            ok: false,
            error: "FILE_NOT_FOUND",
            file_path: filePath,
            message: `No file exists at ${filePath}. You may need to create it first with file_write.`,
          }),
          status: "error",
        };
      }
      const numbered = file.content
        .split("\n")
        .map((line, i) => `${String(i + 1).padStart(4, " ")}\t${line}`)
        .join("\n");
      return {
        content: JSON.stringify({
          ok: true,
          file_path: file.path,
          size: file.size,
          content: numbered,
        }),
        status: "success",
      };
    }

    return {
      content: JSON.stringify({
        ok: false,
        error: "UNKNOWN_TOOL",
        message: `Tool '${name}' is not implemented on the client.`,
      }),
      status: "error",
    };
  } catch (e) {
    return {
      content: JSON.stringify({
        ok: false,
        error: "TOOL_EXECUTION_ERROR",
        message: e instanceof Error ? e.message : String(e),
      }),
      status: "error",
    };
  }
}
