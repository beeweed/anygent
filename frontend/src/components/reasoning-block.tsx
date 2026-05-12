"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import { Icon } from "./icons";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  streaming?: boolean;
}

/**
 * Collapsible "Reasoning" panel. Defaults to open while streaming so the user
 * sees the agent thinking; collapses by default once the turn is over.
 */
export function ReasoningBlock({ text, streaming }: Props) {
  const [open, setOpen] = useState<boolean>(true);
  if (!text) return null;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-white/5 bg-[#1a1a1c] overflow-hidden">
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.03] transition-colors"
          >
            <Icon.Brain className="w-3.5 h-3.5 text-indigo-400" />
            <span
              className={cn(
                "font-medium",
                streaming && "shiny-text",
              )}
            >
              {streaming ? "Reasoning…" : "Reasoning"}
            </span>
            <Icon.ChevronDown
              className={cn(
                "ml-auto w-3.5 h-3.5 text-zinc-500 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div className="px-3 pb-3 pt-1 text-[12.5px] leading-relaxed text-zinc-400 whitespace-pre-wrap font-mono max-h-56 overflow-y-auto border-t border-white/5">
            {text}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}
