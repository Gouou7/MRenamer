import type { Page } from "@playwright/test";
import variables from "../../../src/lib/variables.json" with { type: "json" };
export async function addFiles(page: Page) {
  await page.getByRole("menuitem", { name: "文件", exact: true }).click();
  await page.getByRole("menuitem", { name: "添加文件", exact: true }).click();
}
export async function openSettings(page: Page, chinese = true) {
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("menuitem", { name: chinese ? "编辑" : "Edit", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: chinese ? "设置" : "Settings", exact: true })
    .click();
  const settings = await popup;
  await settings.waitForLoadState();
  return settings;
}
export async function mockDesktop(page: Page, count: number) {
  await page.addInitScript(
    ({ count, variables }) => {
      const win = window as unknown as Record<string, any>;
      win.isTauri = true;
      win.__previewCalls = [];
      win.__dialogCalls = [];
      win.__closeCalls = 0;
      win.__accentColor = null;
      win.__clipboardText = "";
      win.__clipboardCalls = [];
      win.__previewRequests = [];
      win.__settingsOpenCalls = 0;
      win.__scanCalls = [];
      const entries = Array.from({ length: count }, (_, i) => ({
        id: `file-${i}`,
        path: `/fixtures/image${i}.png`,
        name: `image${i}.png`,
        kind: "file",
        error: null,
        fingerprint: null,
      }));
      let callback = 0;
      win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
      win.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: {
            label: location.search.includes("view=settings")
              ? "settings"
              : "main",
          },
          currentWebview: {
            label: location.search.includes("view=settings")
              ? "settings"
              : "main",
          },
        },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        invoke: async (command: string, args: any) => {
          if (command === "open_settings") {
            if (win.__settingsOpenError)
              throw { code: "settingsOpen", detail: "fixture" };
            win.__settingsOpenCalls++;
            win.open(
              "/?view=settings",
              "mrenamer-settings",
              "popup,width=820,height=680",
            );
            return null;
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
          if (command === "list_history") return [];
          if (command === "plugin:event|listen") return ++callback;
          if (command === "plugin:event|unlisten") return null;
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
            if (location.search.includes("view=settings")) win.close();
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
