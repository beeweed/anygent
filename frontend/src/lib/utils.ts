import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function getFileLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    scss: "scss",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    sql: "sql",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    rb: "ruby",
    php: "php",
    xml: "xml",
    toml: "toml",
  };
  return map[ext] ?? "plaintext";
}

export function getFileIcon(path: string): { color: string } {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "#3b82f6",
    tsx: "#3b82f6",
    js: "#facc15",
    jsx: "#facc15",
    py: "#22c55e",
    json: "#22c55e",
    md: "#a1a1aa",
    html: "#f97316",
    css: "#a855f7",
    scss: "#a855f7",
    yml: "#ef4444",
    yaml: "#ef4444",
  };
  return { color: map[ext] ?? "#a1a1aa" };
}
