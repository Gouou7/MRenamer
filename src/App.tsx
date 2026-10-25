import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useDefaultLayout } from "react-resizable-panels";
import type { SortingState } from "@tanstack/react-table";
import {
  TextCursorInput,
  Replace,
  Scissors,
  ListOrdered,
  MoveHorizontal,
  CaseSensitive,
  FolderOpen,
  Check,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppToolbar } from "@/components/AppToolbar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { StatusBar } from "@/components/StatusBar";
import { FieldGroup } from "@/components/ui/field";
import { RuleEditor, Choice, Flag } from "@/components/RuleEditor";
import { RuleList } from "@/components/RuleList";
import { FileTable } from "@/components/FileTable";
import {
  createRule,
  ruleTypes,
  type RenameRule,
  type RuleType,
  type FileEntry,
  type RenamePlan,
  type PreviewRow,
  type HistoryEntry,
  type Progress,
} from "@/lib/types";
import { orderEntries } from "@/lib/order";
import { useSidebarLayout } from "@/lib/use-sidebar-layout";
import "@/lib/i18n";

const icons = {
  add: TextCursorInput,
  replace: Replace,
  remove: Scissors,
  number: ListOrdered,
  move: MoveHorizontal,
  case: CaseSensitive,
};
export default function App() {
  const { t, i18n } = useTranslation();
  const desktop = isTauri();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<RenameRule[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [plan, setPlan] = useState<RenamePlan | null>(null);
  const [planKey, setPlanKey] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "originalName", desc: false },
  ]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; detail: string } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sheet, setSheet] = useState<"settings" | "history" | null>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("renamer.theme") || "system",
  );
  const [contents, setContents] = useState(false);
  const [recursive, setRecursive] = useState(false);
  const revision = useRef(0);
  const locked = useRef(false);
  const loadRef = useRef<(paths: string[]) => Promise<void>>(async () => {});
  const verticalLayout = useDefaultLayout({
    id: "renamer.vertical",
    panelIds: ["rules", "files"],
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });
  const horizontalLayout = useDefaultLayout({
    id: "renamer.columns.flat-v3",
    panelIds: ["library", "sequence", "configuration"],
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });
  const sidebarLayout = useSidebarLayout(horizontalLayout.defaultLayout);
  const ordered = useMemo(
    () => orderEntries(entries, sorting),
    [entries, sorting],
  );
  const applicable = useMemo(
    () =>
      ordered.filter((e) => selected.has(e.id) && !e.error).map((e) => e.id),
    [ordered, selected],
  );
  const previewKey = useMemo(
    () => JSON.stringify([ordered.map((e) => e.id), applicable, rules]),
    [ordered, applicable, rules],
  );
  const activeRule = rules.find((r) => r.id === active) ?? null;
  const recovery = history.find((h) =>
    ["recoveryNeeded", "running", "undoing"].includes(h.status),
  );
  const undoable = history.find((h) =>
    ["completed", "recoveryNeeded", "running", "undoing"].includes(h.status),
  );
  const report = useCallback((e: unknown) => {
    setError(
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code: string; detail: string })
        : { code: "internal", detail: String(e) },
    );
  }, []);
  const refreshHistory = useCallback(async () => {
    if (desktop) setHistory(await invoke<HistoryEntry[]>("list_history"));
  }, [desktop]);
  useEffect(() => {
    void refreshHistory().catch(report);
  }, [refreshHistory, report]);
  useEffect(() => {
    localStorage.setItem("renamer.theme", theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    if (active && !rules.some((r) => r.id === active))
      setActive(rules[0]?.id ?? null);
  }, [rules, active, sheet]);
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void listen<Progress>("operation-progress", (event) => {
      if (!cancelled) setProgress(event.payload);
    })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else cleanup = unlisten;
      })
      .catch(report);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [desktop, report]);
  useEffect(() => {
    const current = ++revision.current;
    setPlan(null);
    setPlanKey("");
    setError((previous) =>
      previous && ["invalidRule", "invalidRegex"].includes(previous.code)
        ? null
        : previous,
    );
    if (!desktop || busy) {
      setPending(false);
      return;
    }
    setPending(true);
    const timer = setTimeout(() => {
      void invoke<RenamePlan>("preview_rename", {
        ids: ordered.map((e) => e.id),
        selected: applicable,
        rules,
        revision: current,
      })
        .then((result) => {
          if (current === revision.current) {
            setPlan(result);
            setPlanKey(previewKey);
            setPending(false);
          }
        })
        .catch((e) => {
          if (current === revision.current) {
            report(e);
            setPending(false);
          }
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ++revision.current;
    };
  }, [ordered, applicable, rules, desktop, busy, report, previewKey]);
  const load = useCallback(
    async (paths: string[]) => {
      if (locked.current) return;
      locked.current = true;
      setBusy(true);
      setError(null);
      setMessage("");
      ++revision.current;
      try {
        const added = await invoke<FileEntry[]>("scan_entries", {
          paths,
          contents,
          recursive: contents && recursive,
        });
        setEntries((previous) =>
          Array.from(
            new Map([...previous, ...added].map((e) => [e.id, e])).values(),
          ),
        );
        setSelected(
          (previous) =>
            new Set([
              ...previous,
              ...added.filter((e) => !e.error).map((e) => e.id),
            ]),
        );
      } catch (e) {
        report(e);
      } finally {
        locked.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [contents, recursive, report],
  );
  loadRef.current = load;
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop" && !cancelled)
          void loadRef.current(event.payload.paths);
      })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else cleanup = unlisten;
      })
      .catch(report);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [desktop, report]);
  const choose = async (directory: boolean) => {
    if (!desktop) {
      setError({ code: "desktopOnly", detail: "" });
      return;
    }
    try {
      const paths = await open({ multiple: true, directory });
      if (paths) await load(Array.isArray(paths) ? paths : [paths]);
    } catch (e) {
      report(e);
    }
  };
  const add = (type: RuleType) => {
    const rule = createRule(type);
    setRules((v) => [...v, rule]);
    setActive(rule.id);
  };
  const chooseRule = (id: string) => {
    setActive(id);
  };
  const updateRule = (rule: RenameRule) =>
    setRules((v) => v.map((r) => (r.id === rule.id ? rule : r)));
  const execute = async () => {
    if (!plan || locked.current || pending || planKey !== previewKey) return;
    const snapshot = plan;
    locked.current = true;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const operation = await invoke<HistoryEntry>("execute_rename", {
        planId: snapshot.id,
      });
      setMessage(t("completed", { count: operation.count }));
      const fresh = await invoke<FileEntry[]>("scan_entries", {
        paths: snapshot.rows.map((r) => r.targetPath),
        contents: false,
        recursive: false,
      });
      setEntries(fresh);
      setSelected(new Set());
    } catch (e) {
      report(e);
    } finally {
      await refreshHistory().catch(report);
      locked.current = false;
      setBusy(false);
      setProgress(null);
    }
  };
  const undo = async (id: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const operation = await invoke<HistoryEntry>("undo_rename", {
        operationId: id,
      });
      setMessage(t("restored", { count: operation.count }));
      setEntries([]);
      setSelected(new Set());
    } catch (e) {
      report(e);
    } finally {
      await refreshHistory().catch(report);
      locked.current = false;
      setBusy(false);
      setProgress(null);
    }
  };
  const rows = useMemo(() => {
    const byId = new Map(plan?.rows.map((r) => [r.id, r]));
    return ordered.map(
      (e) =>
        byId.get(e.id) ??
        ({
          id: e.id,
          originalPath: e.path,
          targetPath: e.path,
          originalName: e.name,
          newName: e.name,
          kind: e.kind,
          selected: selected.has(e.id),
          status: e.error ? "error" : "unchanged",
          error: e.error,
        } satisfies PreviewRow),
    );
  }, [plan, ordered, selected]);
  const config = activeRule ? (
    <RuleEditor rule={activeRule} onChange={updateRule} disabled={busy} />
  ) : null;
  const errorLabel = error
    ? t(`errors.${error.code}`, { defaultValue: t("errors.internal") })
    : "";
  const detailLabel =
    error?.code === "invalidRule"
      ? t(`errors.${error.detail}`, { defaultValue: errorLabel })
      : errorLabel;
  return (
    <div className="app-shell">
      <AppToolbar
        busy={busy}
        desktop={desktop}
        executeDisabled={
          !rules.some((rule) => rule.enabled) ||
          !desktop ||
          busy ||
          pending ||
          planKey !== previewKey ||
          !plan?.changes ||
          !!plan?.conflicts ||
          !!recovery
        }
        undoDisabled={busy || !undoable}
        removeDisabled={busy || !selected.size}
        clearDisabled={busy || !entries.length}
        onAdd={(directory) => void choose(directory)}
        onExecute={() => void execute()}
        onUndo={() => undoable && void undo(undoable.id)}
        onRemove={() => {
          setEntries((entries) =>
            entries.filter((entry) => !selected.has(entry.id)),
          );
          setSelected(new Set());
        }}
        onClear={() => {
          setEntries([]);
          setSelected(new Set());
        }}
        onSettings={() => setSheet("settings")}
        onHistory={() => setSheet("history")}
        onExit={() => {
          if (desktop && !locked.current)
            void getCurrentWindow().close().catch(report);
        }}
      />
      <main className="workspace">
        <section className="workbench">
          <ResizablePanelGroup
            orientation="vertical"
            defaultLayout={verticalLayout.defaultLayout}
            onLayoutChanged={verticalLayout.onLayoutChanged}
          >
            <ResizablePanel id="rules" defaultSize="47%" minSize={180}>
              <ResizablePanelGroup
                id="rule-columns"
                orientation="horizontal"
                defaultLayout={sidebarLayout.defaultLayout}
                onLayoutChanged={(layout, meta) => {
                  horizontalLayout.onLayoutChanged(layout, meta);
                  sidebarLayout.onLayoutChanged(layout, meta);
                }}
              >
                <ResizablePanel
                  id="library"
                  defaultSize={200}
                  minSize={180}
                  maxSize={260}
                  groupResizeBehavior="preserve-pixel-size"
                >
                  <div className="panel library-panel">
                    <div className="panel-heading">
                      <h2>{t("library")}</h2>
                    </div>
                    <div className="rule-library">
                      {ruleTypes.map((type) => {
                        const Icon = icons[type];
                        return (
                          <button
                            className="library-item"
                            key={type}
                            title={t(type)}
                            onClick={() => add(type)}
                            disabled={busy}
                          >
                            <span className="library-icon">
                              <Icon />
                            </span>
                            <span className="library-label">
                              <strong>{t(type)}</strong>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel
                  id="sequence"
                  defaultSize={300}
                  minSize={240}
                  maxSize={440}
                  groupResizeBehavior="preserve-pixel-size"
                >
                  <div className="panel execution-panel">
                    <div className="panel-heading">
                      <h2>{t("sequence")}</h2>
                      <Badge variant="secondary">{rules.length}</Badge>
                    </div>
                    {!!rules.length && (
                      <p className="sequence-hint">{t("rulesHint")}</p>
                    )}
                    <div className="panel-scroll">
                      {rules.length ? (
                        <RuleList
                          rules={rules}
                          active={active}
                          disabled={busy}
                          onSelect={chooseRule}
                          onChange={setRules}
                        />
                      ) : (
                        <Empty className="rule-empty">
                          <EmptyHeader>
                            <EmptyDescription>{t("noRules")}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel id="configuration" minSize={320}>
                  <div className="panel config-panel">
                    <div className="panel-heading">
                      <h2>
                        {activeRule
                          ? t(activeRule.config.type)
                          : t("configuration")}
                      </h2>
                    </div>
                    <div className="panel-scroll">
                      {config ?? (
                        <Empty className="rule-empty">
                          <EmptyHeader>
                            <EmptyDescription>
                              {t("chooseRule")}
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="files" defaultSize="53%" minSize={170}>
              <div className="files-panel">
                <div className="files-heading">
                  <div className="file-heading-main">
                    <div className="file-heading-title">
                      <h2>{t("files")}</h2>
                      <Badge variant="secondary">{entries.length}</Badge>
                      <span className="preview-label">
                        {pending ? <LoaderCircle /> : <Check />}
                        {t(pending ? "refreshing" : "preview")}
                      </span>
                    </div>
                  </div>
                </div>
                {rows.length ? (
                  <FileTable
                    rows={rows}
                    selected={selected}
                    onSelected={setSelected}
                    disabled={busy}
                    sorting={sorting}
                    onSorting={setSorting}
                  />
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FolderOpen />
                      </EmptyMedia>
                      <EmptyTitle>
                        {t(entries.length ? "noMatches" : "noFiles")}
                      </EmptyTitle>
                      <EmptyDescription>{t("dropHint")}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </section>
        <StatusBar
          total={entries.length}
          changes={plan?.changes ?? 0}
          conflicts={plan?.conflicts ?? 0}
          busy={busy}
          pending={pending}
          desktop={desktop}
          message={message}
          progress={progress}
          error={
            error
              ? {
                  message: detailLabel,
                  detail: error.code === "invalidRule" ? "" : error.detail,
                }
              : null
          }
          recovery={!!recovery}
          onRecover={() => recovery && void undo(recovery.id)}
        />
      </main>
      <Sheet
        open={sheet !== null}
        onOpenChange={(value) => !value && setSheet(null)}
      >
        <SheetContent className="app-sheet" showCloseButton={false}>
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>
                {t(sheet === "settings" ? "settings" : "history")}
              </SheetTitle>
              <SheetClose render={<Button variant="ghost" size="sm" />}>
                {t("close")}
              </SheetClose>
            </div>
            <SheetDescription className="sr-only">
              {t(sheet === "settings" ? "appearance" : "history")}
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-scroll">
            {sheet === "settings" && (
              <FieldGroup>
                <Choice
                  label={t("theme")}
                  value={theme}
                  values={["system", "light", "dark"].map((v) => [v, t(v)])}
                  onChange={setTheme}
                />
                <Choice
                  label={t("language")}
                  value={i18n.language.startsWith("zh") ? "zh-CN" : "en"}
                  values={[
                    ["zh-CN", "简体中文"],
                    ["en", "English"],
                  ]}
                  onChange={(v) => void i18n.changeLanguage(v)}
                />
                <h3 className="settings-heading">{t("importOptions")}</h3>
                <Flag
                  label={t("contents")}
                  value={contents}
                  disabled={busy}
                  onChange={setContents}
                />
                <Flag
                  label={t("recursive")}
                  value={recursive}
                  disabled={busy || !contents}
                  onChange={setRecursive}
                />
                <p className="help-text">{t("importHint")}</p>
              </FieldGroup>
            )}
            {sheet === "history" &&
              (history.length ? (
                <div className="history-list">
                  {history.map((h) => (
                    <article className="history-item" key={h.id}>
                      <div className="flex items-center justify-between">
                        <Badge
                          variant={
                            h.status === "recoveryNeeded"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {t(
                            h.status === "completed"
                              ? "historyCompleted"
                              : h.status,
                          )}
                        </Badge>
                        <span>{h.count}</span>
                      </div>
                      <time>
                        {new Date(h.created * 1000).toLocaleString(
                          i18n.language,
                        )}
                      </time>
                      {h.detail && (
                        <details>
                          <summary>{t("showDetails")}</summary>
                          <pre>{h.detail}</pre>
                        </details>
                      )}
                      {!!h.pendingPaths?.length && (
                        <details open>
                          <summary>{t("pendingObjects")}</summary>
                          <ul>
                            {h.pendingPaths.map((path) => (
                              <li key={path} className="break-all">
                                {path}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {h.id === undoable?.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => void undo(h.id)}
                        >
                          {t(h.status === "completed" ? "undo" : "recover")}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{t("noHistory")}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
