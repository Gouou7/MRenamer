import type { Page } from "@playwright/test";
export async function addFiles(page: Page) {
  await page.getByRole("menuitem", { name: "文件", exact: true }).click();
  await page.getByRole("menuitem", { name: "添加文件", exact: true }).click();
}
export async function mockDesktop(page: Page, count: number) {
  await page.addInitScript(
    ({ count }) => {
      const win = window as unknown as Record<string, any>;
      win.isTauri = true;
      win.__previewCalls = [];
      win.__dialogCalls = [];
      win.__closeCalls = 0;
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
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        invoke: async (command: string, args: any) => {
          if (command === "list_history") return [];
          if (command === "plugin:event|listen") return ++callback;
          if (command === "plugin:event|unlisten") return null;
          if (command === "plugin:dialog|open") {
            win.__dialogCalls.push(args.options);
            return ["/fixtures"];
          }
          if (command === "scan_entries") return entries;
          if (command === "plugin:window|close") {
            win.__closeCalls++;
            return null;
          }
          if (command === "preview_rename") {
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
    { count },
  );
}
