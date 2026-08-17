import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import ScraperPage from "@/pages/scraper";
import {
  ScraperWorkspaceContext,
  type ScraperWorkspaceContextValue,
  type ScraperWorkspaceTabMeta,
} from "@/components/scraper-workspace-context";

const MAX_TABS = 6;
const DEFAULT_DOCUMENT_TITLE = "Turmarkt - Ürün Çekme Uygulaması";

type WorkspaceTab = {
  id: string;
  meta: ScraperWorkspaceTabMeta;
};

function newTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyTab(): WorkspaceTab {
  return { id: newTabId(), meta: { title: "Yeni çekim", busy: false } };
}

function labelFor(tab: WorkspaceTab, index: number): string {
  const raw = tab.meta.title.trim();
  if (!raw || raw === "Yeni çekim") return `Çekim ${index + 1}`;
  return raw.length > 26 ? `${raw.slice(0, 24)}…` : raw;
}

const KeepAliveScraperTab = memo(function KeepAliveScraperTab({
  tabId,
  isActive,
  onReportMeta,
}: {
  tabId: string;
  isActive: boolean;
  onReportMeta: (tabId: string, meta: ScraperWorkspaceTabMeta) => void;
}) {
  const value = useMemo<ScraperWorkspaceContextValue>(
    () => ({
      tabId,
      isActive,
      reportMeta: (meta) => onReportMeta(tabId, meta),
    }),
    [tabId, isActive, onReportMeta],
  );

  return (
    <ScraperWorkspaceContext.Provider value={value}>
      <div className={isActive ? "block" : "hidden"} aria-hidden={!isActive}>
        <ScraperPage />
      </div>
    </ScraperWorkspaceContext.Provider>
  );
});

export default function ScraperWorkspace() {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => [emptyTab()]);
  const [activeId, setActiveId] = useState<string>("");
  const currentActiveId = activeId || tabs[0]?.id || "";

  const reportMeta = useCallback((tabId: string, meta: ScraperWorkspaceTabMeta) => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        if (tab.meta.title === meta.title && tab.meta.busy === meta.busy) return tab;
        changed = true;
        return { ...tab, meta };
      });
      return changed ? next : prev;
    });
  }, []);

  const addTab = useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const next = emptyTab();
      setActiveId(next.id);
      return [...prev, next];
    });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      setActiveId((current) => {
        if (current !== tabId) return current;
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        return fallback?.id ?? current;
      });
      return next;
    });
  }, []);

  const busyCount = tabs.filter((t) => t.meta.busy).length;

  useEffect(() => {
    if (busyCount > 0) {
      document.title =
        busyCount === 1
          ? "Ürün çekiliyor… · Turmarkt"
          : `(${busyCount} sekme) Çekim devam ediyor · Turmarkt`;
    } else {
      document.title = DEFAULT_DOCUMENT_TITLE;
    }
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [busyCount]);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 border-b border-zinc-800/90 bg-zinc-950/95 backdrop-blur-sm">
        <div className="flex items-center gap-1 overflow-x-auto px-1 py-1.5 scrollbar-thin">
          {tabs.map((tab, index) => {
            const active = tab.id === currentActiveId;
            return (
              <div
                key={tab.id}
                className={`group flex min-w-0 max-w-[220px] shrink-0 items-center rounded-md border px-1.5 py-1 ${
                  active
                    ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                    : "border-transparent bg-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-0.5 text-left text-xs font-medium"
                  onClick={() => setActiveId(tab.id)}
                  title={tab.meta.title}
                  data-testid={`scraper-tab-${index}`}
                >
                  {tab.meta.busy ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-400" />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                  )}
                  <span className="truncate">{labelFor(tab, index)}</span>
                </button>
                {tabs.length > 1 ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-zinc-500 opacity-70 hover:bg-zinc-700 hover:text-zinc-100 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    aria-label="Sekmeyi kapat"
                    data-testid={`scraper-tab-close-${index}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addTab}
            disabled={tabs.length >= MAX_TABS}
            className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              tabs.length >= MAX_TABS
                ? `En fazla ${MAX_TABS} sekme`
                : "Yeni çekim sekmesi — mevcut işlem arka planda devam eder"
            }
            data-testid="scraper-tab-add"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {busyCount > 0 && tabs.some((t) => t.id !== currentActiveId && t.meta.busy) ? (
          <p className="px-3 pb-1.5 text-[11px] text-amber-400/90">
            {busyCount} çekim arka planda devam ediyor — sekmeler arasında geçiş güvenli.
          </p>
        ) : null}
      </div>

      {tabs.map((tab) => (
        <KeepAliveScraperTab
          key={tab.id}
          tabId={tab.id}
          isActive={tab.id === currentActiveId}
          onReportMeta={reportMeta}
        />
      ))}
    </div>
  );
}
