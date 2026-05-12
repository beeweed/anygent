"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { FilePanel } from "@/components/file-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { loadSettings, saveSettings } from "@/lib/settings";
import type { AgentSettings } from "@/lib/types";

export default function Page() {
  const [settings, setSettings] = useState<AgentSettings>({
    apiKey: "",
    model: "",
    enableReasoning: true,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "files">("chat");

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setHydrated(true);
    // Prompt for settings on first visit.
    if (!s.apiKey || !s.model) {
      setSettingsOpen(true);
    }
  }, []);

  const onSave = (next: AgentSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  if (!hydrated) {
    // Render a blank shell to avoid SSR/CSR hydration mismatch from localStorage.
    return <main className="h-screen w-screen bg-[var(--background)]" />;
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-[var(--background)]">
      {/* Desktop layout */}
      <div className="hidden md:flex h-full">
        <div className="w-[440px] min-w-[380px] max-w-[520px] shrink-0 lg:w-[40%]">
          <ChatPanel
            settings={settings}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        <FilePanel />
      </div>

      {/* Mobile layout (tab-switched) */}
      <div className="md:hidden flex flex-col h-full">
        <div className="flex-1 min-h-0">
          {mobileTab === "chat" ? (
            <ChatPanel
              settings={settings}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <div className="flex h-full">
              <FilePanel />
            </div>
          )}
        </div>
        <div className="flex h-14 bg-[var(--surface-2)] border-t border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={`flex-1 flex items-center justify-center gap-2 transition-colors ${
              mobileTab === "chat"
                ? "text-indigo-300 bg-indigo-500/10"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <span className="text-sm font-medium">Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("files")}
            className={`flex-1 flex items-center justify-center gap-2 transition-colors ${
              mobileTab === "files"
                ? "text-indigo-300 bg-indigo-500/10"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <span className="text-sm font-medium">Files</span>
          </button>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={onSave}
      />
    </main>
  );
}
