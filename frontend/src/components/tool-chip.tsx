"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import { Icon } from "./icons";
import { cn } from "@/lib/utils";

interface ToolChipProps {
  name: string;
  argsRaw?: string;
  status?: "running" | "success" | "error";
  result?: string;
}

/**
 * Minimal chip-style tool activity block.
 *  - file_write → "create: <path>"
 *  - file_read  → "read: <path>"
 *  - any other tool → "call: <name>"
 *
 * Click expands a small panel that shows the raw arguments and (when
 * available) the tool response. Designed to be unobtrusive in the chat.
 */
export function ToolChip({
  name,
  argsRaw,
  status = "running",
  result,
}: ToolChipProps) {
  const [open, setOpen] = useState(false);

  let parsed: Record<string, unknown> = {};
  try {
    parsed = argsRaw ? JSON.parse(argsRaw) : {};
  } catch {
    parsed = {};
  }
  const filePath = typeof parsed.file_path === "string" ? parsed.file_path : "";

  let label: string;
  let LeadingIcon = Icon.Bolt;
  if (name === "file_write") {
    label = filePath || "(no path)";
    LeadingIcon = Icon.Write;
  } else if (name === "file_read") {
    label = filePath || "(no path)";
    LeadingIcon = Icon.Read;
  } else {
    label = name;
    LeadingIcon = Icon.Bolt;
  }
  const verb =
    name === "file_write" ? "create" : name === "file_read" ? "read" : "call";

  const statusColor =
    status === "success"
      ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/8"
      : status === "error"
        ? "text-rose-400 border-rose-500/25 bg-rose-500/8"
        : "text-indigo-300 border-indigo-500/25 bg-indigo-500/8";

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-2 max-w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 hover:bg-white/[0.04]",
            statusColor,
          )}
        >
          <LeadingIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 shrink-0">
            {verb}
          </span>
          <span className="truncate min-w-0 text-zinc-200">{label}</span>
          {status === "running" && (
            <Icon.Spinner className="w-3 h-3 animate-spin shrink-0" />
          )}
          {status === "success" && <Icon.Check className="w-3 h-3 shrink-0" />}
          {status === "error" && <Icon.Alert className="w-3 h-3 shrink-0" />}
          <Icon.ChevronDown
            className={cn(
              "w-3 h-3 ml-0.5 transition-transform shrink-0 text-zinc-500",
              open && "rotate-180",
            )}
          />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="mt-1.5">
        <div className="rounded-lg border border-white/5 bg-[#1a1a1c] p-2.5 font-mono text-[11px] text-zinc-300 overflow-hidden">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Arguments
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-300">
            {argsRaw && argsRaw.length > 800
              ? argsRaw.slice(0, 800) + "\n… (truncated)"
              : argsRaw || "{}"}
          </pre>
          {result && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-2 mb-1">
                Result
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-zinc-300 max-h-56">
                {result.length > 1200 ? result.slice(0, 1200) + "\n… (truncated)" : result}
              </pre>
            </>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
