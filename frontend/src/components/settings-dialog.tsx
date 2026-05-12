"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import * as Label from "@radix-ui/react-label";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { fetchModels } from "@/lib/api";
import type { AgentSettings, ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AgentSettings;
  onSave: (next: AgentSettings) => void;
}

export function SettingsDialog({ open, onOpenChange, settings, onSave }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [enableReasoning, setEnableReasoning] = useState(
    settings.enableReasoning,
  );
  const [showKey, setShowKey] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyTools, setOnlyTools] = useState(true);

  useEffect(() => {
    if (open) {
      setApiKey(settings.apiKey);
      setModel(settings.model);
      setEnableReasoning(settings.enableReasoning);
    }
  }, [open, settings.apiKey, settings.model, settings.enableReasoning]);

  // Auto-load models when the dialog opens with an API key present.
  useEffect(() => {
    if (!open) return;
    if (!apiKey) return;
    if (models.length > 0) return;
    void doFetchModels(apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function doFetchModels(key: string) {
    if (!key) {
      setModelsError("Add an API key first.");
      return;
    }
    setLoadingModels(true);
    setModelsError(null);
    try {
      const m = await fetchModels(key);
      setModels(m);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModels(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models
      .filter((m) => (onlyTools ? m.supports_tools : true))
      .filter((m) => {
        if (!q) return true;
        return (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
        );
      });
  }, [models, search, onlyTools]);

  const canSave = !!apiKey && !!model;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(95vw,640px)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-white/8 bg-[#1f1f21] shadow-2xl overflow-hidden flex flex-col",
            "data-[state=open]:animate-fade-in",
          )}
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <Dialog.Description className="sr-only">
            Configure your OpenRouter API key, select a model and toggle
            reasoning.
          </Dialog.Description>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/25 to-cyan-500/20">
                <Icon.Settings className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Settings
                </h2>
                <p className="text-xs text-zinc-500">
                  Configure your Vibe Coder agent
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <Icon.Close className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 overflow-y-auto">
            {/* API key */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon.Key className="w-4 h-4 text-indigo-400" />
                <Label.Root
                  htmlFor="api-key"
                  className="text-sm font-medium text-zinc-200"
                >
                  OpenRouter API Key
                </Label.Root>
              </div>
              <div className="flex items-center gap-2 bg-[#2a2a2c] rounded-xl px-3 py-2.5 border border-white/5 focus-within:border-indigo-500/40 transition-colors">
                <input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-or-v1-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  {showKey ? "hide" : "show"}
                </button>
                <button
                  type="button"
                  onClick={() => doFetchModels(apiKey)}
                  disabled={!apiKey || loadingModels}
                  className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-200 text-[11px] font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {loadingModels ? (
                    <Icon.Spinner className="w-3 h-3 animate-spin" />
                  ) : (
                    <Icon.Bolt className="w-3 h-3" />
                  )}
                  Load models
                </button>
              </div>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:underline"
              >
                Get an API key →
              </a>
            </section>

            {/* Model selection */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon.Cpu className="w-4 h-4 text-cyan-400" />
                  <Label.Root className="text-sm font-medium text-zinc-200">
                    Model
                  </Label.Root>
                  {models.length > 0 && (
                    <span className="text-[10px] text-zinc-500">
                      {filtered.length}/{models.length} shown
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <Switch.Root
                    checked={onlyTools}
                    onCheckedChange={setOnlyTools}
                    className="w-8 h-[18px] bg-zinc-700 data-[state=checked]:bg-indigo-500 rounded-full relative outline-none transition-colors"
                  >
                    <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full shadow translate-x-0.5 data-[state=checked]:translate-x-[18px] transition-transform" />
                  </Switch.Root>
                  Tool-capable only
                </label>
              </div>

              <div className="relative">
                <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search models…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#2a2a2c] rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 border border-white/5 focus:border-indigo-500/30 transition-all"
                />
              </div>

              <div className="bg-[#262628] rounded-xl max-h-[300px] overflow-y-auto p-1.5 border border-white/5">
                {loadingModels && models.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
                    <Icon.Spinner className="w-5 h-5 animate-spin" />
                    Loading models…
                  </div>
                )}
                {modelsError && (
                  <div className="px-4 py-4 text-sm text-rose-300 flex items-start gap-2">
                    <Icon.Alert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="break-words">{modelsError}</span>
                  </div>
                )}
                {!loadingModels && !modelsError && models.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500">
                    Add your API key and click <strong>Load models</strong>.
                  </div>
                )}
                {filtered.map((m) => {
                  const selected = m.id === model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={cn(
                        "w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-lg transition-colors",
                        selected
                          ? "bg-indigo-500/15 border border-indigo-500/30"
                          : "hover:bg-white/[0.04] border border-transparent",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-zinc-100 truncate">
                            {m.name}
                          </span>
                          {m.supports_tools && (
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                              tools
                            </span>
                          )}
                          {m.supports_reasoning && (
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                              reasoning
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate font-mono">
                          {m.id}
                        </div>
                      </div>
                      {selected && (
                        <Icon.Check className="w-4 h-4 text-indigo-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Reasoning toggle */}
            <section className="flex items-center justify-between gap-3 px-3 py-3 bg-[#262628] rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/15">
                  <Icon.Brain className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-100">
                    Show reasoning
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Stream the model&apos;s reasoning channel when supported.
                  </div>
                </div>
              </div>
              <Switch.Root
                checked={enableReasoning}
                onCheckedChange={setEnableReasoning}
                className="w-10 h-5 bg-zinc-700 data-[state=checked]:bg-indigo-500 rounded-full relative outline-none transition-colors"
              >
                <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow translate-x-0.5 data-[state=checked]:translate-x-[22px] transition-transform" />
              </Switch.Root>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/5 bg-[#1a1a1c]">
            <div className="text-[11px] text-zinc-600">
              Stored locally. Never persisted on the server.
            </div>
            <div className="flex items-center gap-3">
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                disabled={!canSave}
                onClick={() => {
                  onSave({ apiKey, model, enableReasoning });
                  onOpenChange(false);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-medium shadow-md shadow-indigo-500/20 hover:bg-indigo-500/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <Icon.Check className="w-4 h-4" />
                Save changes
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
