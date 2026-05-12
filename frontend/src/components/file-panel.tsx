"use client";

import { useEffect, useMemo, useState } from "react";
import hljs from "highlight.js/lib/common";
import { Icon } from "./icons";
import { FileSystem } from "@/lib/file-system";
import type { VirtualFile } from "@/lib/types";
import { cn, formatBytes, getFileIcon } from "@/lib/utils";

/**
 * File panel: VS Code-ish split with a left explorer tree and a right code
 * viewer. Files are loaded from the browser-resident `FileSystem` and update
 * live via the FS subscribe channel.
 */
export function FilePanel() {
  const [files, setFiles] = useState<VirtualFile[]>(() =>
    typeof window === "undefined" ? [] : FileSystem.list(),
  );
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setFiles(FileSystem.list());
    const off = FileSystem.subscribe(() => setFiles(FileSystem.list()));
    return off;
  }, []);

  // Auto-select the most recently touched file when the selection is stale.
  useEffect(() => {
    if (!files.length) {
      setSelected(null);
      return;
    }
    if (!selected || !files.some((f) => f.path === selected)) {
      const newest = [...files].sort((a, b) => b.updated_at - a.updated_at)[0];
      setSelected(newest.path);
    }
  }, [files, selected]);

  const current = useMemo(
    () => (selected ? files.find((f) => f.path === selected) ?? null : null),
    [selected, files],
  );

  return (
    <div className="flex-1 min-w-0 flex h-full">
      {/* Explorer */}
      <div className="w-60 lg:w-72 shrink-0 bg-[var(--surface-2)] border-r border-white/5 flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Icon.FolderOpen className="w-4 h-4 text-zinc-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Explorer
            </span>
            <span className="text-[10px] text-zinc-600">({files.length})</span>
          </div>
          <button
            onClick={() => {
              if (confirm("Delete all files from the browser sandbox?")) {
                FileSystem.clear();
              }
            }}
            title="Clear file system"
            disabled={files.length === 0}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon.Trash className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {files.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-600">
              No files yet. Ask the agent to build something.
            </div>
          ) : (
            <FileTree
              files={files}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface)]">
        {current ? (
          <FileViewer file={current} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            Select a file to view its content
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* File tree                                                                  */
/* -------------------------------------------------------------------------- */

interface TreeNode {
  name: string;
  path: string; // for files, the full virtual path; for folders, the prefix
  isFile: boolean;
  children: Map<string, TreeNode>;
  file?: VirtualFile;
}

function buildTree(files: VirtualFile[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isFile: false,
    children: new Map(),
  };
  for (const f of files) {
    const parts = f.path.replace(/^\/+/, "").split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: "/" + parts.slice(0, i + 1).join("/"),
          isFile: isLast,
          children: new Map(),
          file: isLast ? f : undefined,
        };
        node.children.set(part, child);
      } else if (isLast) {
        child.isFile = true;
        child.file = f;
      }
      node = child;
    });
  }
  return root;
}

function FileTree({
  files,
  selected,
  onSelect,
}: {
  files: VirtualFile[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const root = useMemo(() => buildTree(files), [files]);
  return (
    <div className="px-1.5">
      <TreeChildren node={root} depth={0} selected={selected} onSelect={onSelect} />
    </div>
  );
}

function TreeChildren({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  // Folders first, then files; both alphabetical
  const entries = [...node.children.values()].sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return (
    <>
      {entries.map((n) =>
        n.isFile ? (
          <FileRow
            key={n.path}
            node={n}
            depth={depth}
            selected={selected === n.path}
            onSelect={onSelect}
          />
        ) : (
          <FolderRow
            key={n.path}
            node={n}
            depth={depth}
            selected={selected}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  );
}

function FolderRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState<boolean>(depth < 2);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded-md transition-colors"
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {open ? (
          <Icon.ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
        ) : (
          <Icon.ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
        )}
        <Icon.Folder className="w-3.5 h-3.5 text-yellow-500/80 shrink-0" />
        <span className="text-[12.5px] text-zinc-300 truncate">{node.name}</span>
      </button>
      {open && (
        <TreeChildren
          node={node}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function FileRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: boolean;
  onSelect: (path: string) => void;
}) {
  const { color } = getFileIcon(node.name);
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-left",
        selected
          ? "bg-indigo-500/15 text-indigo-200"
          : "hover:bg-white/5 text-zinc-300",
      )}
      style={{ paddingLeft: 18 + depth * 12 }}
    >
      <Icon.FileCode className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <span className="text-[12.5px] truncate">{node.name}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* File viewer                                                                */
/* -------------------------------------------------------------------------- */

function FileViewer({ file }: { file: VirtualFile }) {
  const [copied, setCopied] = useState(false);
  const lang = useMemo(() => {
    const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
    if (hljs.getLanguage(ext)) return ext;
    return "plaintext";
  }, [file.path]);

  const highlighted = useMemo(() => {
    try {
      if (lang === "plaintext") return null;
      return hljs.highlight(file.content, { language: lang, ignoreIllegals: true })
        .value;
    } catch {
      return null;
    }
  }, [file.content, lang]);

  const lineCount = useMemo(
    () => file.content.split("\n").length,
    [file.content],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex items-center h-10 bg-[var(--surface)] border-b border-white/5 px-3 gap-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] rounded-t-md border-t-2 border-indigo-500">
          <Icon.FileCode
            className="w-3.5 h-3.5"
            style={{ color: getFileIcon(file.path).color }}
          />
          <span className="text-xs font-medium text-zinc-200">
            {file.path.split("/").pop()}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={copy}
            title="Copy"
            className="px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon.Copy className="w-3.5 h-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={download}
            title="Download"
            className="px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors inline-flex items-center gap-1.5"
          >
            <Icon.Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      <div className="flex items-center h-7 px-4 bg-[var(--surface)] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 overflow-hidden">
          {file.path.split("/").filter(Boolean).map((seg, i, arr) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className={i === arr.length - 1 ? "text-zinc-300" : ""}>
                {seg}
              </span>
              {i < arr.length - 1 && (
                <Icon.ChevronRight className="w-3 h-3" />
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto font-mono text-[12.5px] leading-6 bg-[var(--surface)]">
        <div className="flex min-w-full">
          <div className="select-none text-right pr-3 pl-3 pt-3 text-zinc-600 border-r border-white/5">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className="hljs flex-1 pt-3 pb-6 pl-4 pr-4 whitespace-pre overflow-x-auto">
            {highlighted ? (
              <code dangerouslySetInnerHTML={{ __html: highlighted }} />
            ) : (
              <code>{file.content}</code>
            )}
          </pre>
        </div>
      </div>

      <div className="h-6 px-3 bg-[var(--surface-2)] border-t border-white/5 flex items-center text-[10px] text-zinc-500 shrink-0">
        <span className="capitalize">{lang}</span>
        <span className="mx-2">·</span>
        <span>{lineCount} lines</span>
        <span className="mx-2">·</span>
        <span>{formatBytes(file.size)}</span>
        <span className="ml-auto">
          {new Date(file.updated_at).toLocaleTimeString()}
        </span>
      </div>
    </>
  );
}
