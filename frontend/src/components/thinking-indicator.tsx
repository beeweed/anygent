"use client";

/**
 * "Thinking..." indicator with a shimmer/shiny text effect and three
 * dot-wave dots. Shown while the agent is computing before any reasoning or
 * content tokens have streamed in.
 */
export function ThinkingIndicator() {
  return (
    <div className="inline-flex items-center gap-2 py-1">
      <span className="shiny-text text-sm font-medium tracking-wide">
        Thinking
      </span>
      <span className="flex items-center gap-1">
        <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
        <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
        <span className="thinking-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
      </span>
    </div>
  );
}
