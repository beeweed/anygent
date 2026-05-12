/**
 * User settings persistence (API key, selected model, …).
 * Stored in localStorage; never sent to anything except the configured
 * backend (which forwards it to OpenRouter, never persisting it server-side).
 */

import type { AgentSettings } from "./types";

const KEY = "vibe.settings.v1";

const DEFAULTS: AgentSettings = {
  apiKey: "",
  model: "",
  enableReasoning: true,
};

export function loadSettings(): AgentSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AgentSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AgentSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
}
