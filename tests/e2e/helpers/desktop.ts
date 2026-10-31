import type { Page } from "@playwright/test";
import variables from "../../../src/lib/variables.json" with { type: "json" };
export async function addFiles(page: Page) {
  await page.getByRole("menuitem", { name: "文件", exact: true }).click();
  await page.getByRole("menuitem", { name: "添加文件", exact: true }).click();
}
export async function openSettings(page: Page, chinese = true) {
  await page
    .getByRole("menuitem", { name: chinese ? "编辑" : "Edit", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: chinese ? "设置" : "Settings", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: chinese ? "设置" : "Settings", exact: true })
    .waitFor();
  return page;
}
export async function mockDesktop(page: Page, count: number) {
  await page.context().addInitScript(
    ({ count, variables }) => {
      const win = window as unknown as Record<string, any>;
      win.isTauri = true;
      win.__previewCalls = [];
      win.__dialogCalls = [];
      win.__closeCalls = 0;
      win.__windowCalls = [];
      win.__maximized = false;
      win.__accentColor = null;
      win.__clipboardText = "";
      win.__clipboardCalls = [];
      win.__previewRequests = [];
      win.__settingsOpenCalls = 0;
      win.__scanCalls = [];
      win.__historyEntries = [];
      win.__undoCalls = [];
      const entries = Array.from({ length: count }, (_, i) => ({
        id: `file-${i}`,
        path: `/fixtures/image${i}.png`,
        name: `image${i}.png`,
        kind: "file",
        error: null,
        fingerprint: null,
      }));
      let callback = 0;
      const callbacks = new Map<number, (event: any) => void>();
      const listeners = new Map<number, { event: string; handler: number }>();
      const emitWindowEvent = (event: string, payload: unknown) => {
        for (const listener of listeners.values()) {
          if (listener.event === event)
            callbacks.get(listener.handler)?.({ event, payload, id: 0 });
        }
      };
      win.__emitWindowEvent = emitWindowEvent;
      win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      win.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: {
            label: "main",
          },
          currentWebview: {
            label: "main",
          },
        },
        transformCallback: (handler: (event: any) => void) => {
          const id = ++callback;
          callbacks.set(id, handler);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
        invoke: async (command: string, args: any) => {
          if (
            [
              "plugin:window|start_dragging",
              "plugin:window|minimize",
              "plugin:window|toggle_maximize",
            ].includes(command)
          ) {
            win.__windowCalls.push(command);
            if (win.__windowError) throw new Error("Window operation failed");
            if (command.endsWith("toggle_maximize")) {
              win.__maximized = !win.__maximized;
              emitWindowEvent("tauri://resize", {
                width: innerWidth,
                height: innerHeight,
              });
            }
            return null;
          }
          if (command === "plugin:window|is_maximized") return win.__maximized;
          if (command === "open_settings") {
            win.__settingsOpenCalls++;
            throw new Error("Settings must open inside the main window");
          }
          if (command === "plugin:window|set_title") return null;
          if (command === "plugin:event|emit") return null;
          if (command === "list_variables") return variables;
          if (command.startsWith("plugin:clipboard-manager|")) {
            win.__clipboardCalls.push(command);
            if (win.__clipboardError) throw new Error("Clipboard unavailable");
            if (win.__clipboardDelay)
              await new Promise((resolve) =>
                setTimeout(resolve, win.__clipboardDelay),
              );
            if (command.endsWith("read_text")) return win.__clipboardText;
            win.__clipboardText = args.text;
            return null;
          }
          if (command === "system_accent_color") {
            if (win.__accentUnavailable) throw new Error("Color unavailable");
            return win.__accentColor;
          }
          if (command === "list_history") return win.__historyEntries;
          if (command === "undo_rename") {
            win.__undoCalls.push(args.operationId);
            if (win.__undoError)
              throw { code: "undoConflict", detail: "fixture" };
            const operation = win.__historyEntries.find(
              (entry: any) => entry.id === args.operationId,
            );
            operation.status = "undone";
            return operation;
          }
          if (command === "plugin:event|listen") {
            const id = ++callback;
            listeners.set(id, { event: args.event, handler: args.handler });
            return id;
          }
          if (command === "plugin:event|unlisten") {
            listeners.delete(args.eventId);
            return null;
          }
          if (command === "plugin:dialog|open") {
            win.__dialogCalls.push(args.options);
            return ["/fixtures"];
          }
          if (command === "scan_entries") {
            win.__scanCalls.push(args);
            return entries;
          }
          if (command === "plugin:window|close") {
            win.__closeCalls++;
            return null;
          }
          if (command === "preview_rename") {
            win.__previewRequests.push(args);
            if (win.__forcedPreviewError) throw win.__forcedPreviewError;
            const start = args.rules.find(
              (r: any) => r.config.type === "number",
            )?.config.start;
            win.__previewCalls.push(start);
            if (start === 1)
              await new Promise((resolve) => setTimeout(resolve, 900));
            const selected = new Set(args.selected);
            return {
              id: `plan-${args.revision}`,
              revision: args.revision,
              changes: start ? selected.size : 0,
              conflicts: 0,
              rows: args.ids.map((id: string) => {
                const e = entries[Number(id.split("-")[1])];
                return {
                  id,
                  originalPath: e.path,
                  targetPath: e.path,
                  originalName: e.name,
                  newName: start ? `${start}_${e.name}` : e.name,
                  kind: "file",
                  selected: selected.has(id),
                  status: start ? "changed" : "unchanged",
                  error: null,
                };
              }),
            };
          }
          throw new Error(`Unexpected command ${command}`);
        },
      };
    },
    { count, variables },
  );
}
