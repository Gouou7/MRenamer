import { test, expect, type Locator, type Page } from "@playwright/test";
import { mockDesktop, addFiles, openSettings } from "./helpers/desktop";
import variables from "../../src/lib/variables.json" with { type: "json" };

async function selection(field: Locator, start: number, end = start) {
  await field.focus();
  await field.evaluate(
    (element: HTMLInputElement, { start, end }) =>
      element.setSelectionRange(start, end),
    { start, end },
  );
}
async function menu(field: Locator, page: Page) {
  await field.press("Shift+F10");
  await expect(page.getByRole("menu").first()).toBeVisible();
}

for (const language of ["zh-CN", "en"]) {
  for (const theme of ["light", "dark"]) {
    test(`template input, variable menu and reference ${language} ${theme}`, async ({
      page,
    }) => {
      await mockDesktop(page, 0);
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("renamer.language", language);
          localStorage.setItem("renamer.theme", theme);
        },
        { language, theme },
      );
      const zh = language === "zh-CN";
      await page.setViewportSize({ width: 760, height: 680 });
      await page.goto("/");
      await page
        .getByRole("button", {
          name: zh ? "添加与补齐" : "Add and pad",
          exact: true,
        })
        .click();
      const field = page.getByLabel(zh ? "内容" : "Text", { exact: true });
      await field.fill("before_old_after");
      await selection(field, 7, 10);
      await menu(field, page);
      const insert = page.getByRole("menuitem", {
        name: zh ? "插入变量" : "Insert variable",
        exact: true,
      });
      await insert.focus();
      await insert.press("ArrowRight");
      const submenu = page.locator("[data-slot=context-menu-sub-content]");
      await expect(submenu.getByRole("menuitem")).toHaveCount(23);
      await submenu.getByRole("menuitem", { name: /<Date>$/ }).click();
      await expect(field).toHaveValue("before_<Date>_after");
      await expect(field).toBeFocused();
      expect(
        await field.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(13);
      // Raw manual entry remains a template; the frontend does not expand it.
      await field.fill("<dAtE>_<CStem>");
      await selection(field, 14);
      await field.click({ button: "right" });
      await page
        .getByRole("menuitem", {
          name: zh ? "插入变量" : "Insert variable",
          exact: true,
        })
        .hover();
      await expect(submenu).toBeVisible();
      const last = submenu.getByRole("menuitem", {
        name: /<ModifiedDateTime>$/,
      });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      expect(
        await submenu.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.work/screenshots/variables-menu-${language}-${theme}.png`,
        fullPage: true,
      });
      await last.click();
      await expect(field).toHaveValue(/<ModifiedDateTime>/);
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(field).toBeFocused();
      expect(
        await page.evaluate(() => (window as any).__clipboardCalls),
      ).toEqual([]);
      const settings = await openSettings(page, zh);
      await settings.setViewportSize({ width: 760, height: 680 });
      await settings
        .getByRole("button", {
          name: zh ? "可用变量" : "Available variables",
          exact: true,
        })
        .click();
      const reference = settings.locator(".variables-reference");
      await expect(reference).toBeVisible();
      await expect(reference.locator("dt")).toHaveCount(23);
      await expect(page.locator('[data-slot="accordion-content"]')).toHaveCSS(
        "--accordion-panel-height",
        "auto",
      );
      for (const variable of variables) {
        await expect(
          reference
            .locator("code")
            .getByText(`<${variable.name}>`, { exact: true }),
        ).toHaveCount(1);
      }
      await reference.locator("code").last().scrollIntoViewIfNeeded();
      await expect(reference.locator("code").last()).toHaveCSS(
        "user-select",
        "text",
      );
      await settings.screenshot({
        path: `.work/screenshots/variables-reference-${language}-${theme}.png`,
        fullPage: true,
      });
      expect(
        await settings.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    });
  }
}

test("clipboard operations preserve selection and failed writes do not cut text", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  const field = page.getByLabel("内容", { exact: true });
  await field.fill("before_middle_after");
  await selection(field, 7, 13);
  await menu(field, page);
  await page.getByRole("menuitem", { name: "复制", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__clipboardText))
    .toBe("middle");
  await expect(field).toHaveValue("before_middle_after");
  await expect(field).toBeFocused();
  await selection(field, 7, 13);
  await menu(field, page);
  await page.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await expect(field).toHaveValue("before__after");
  await selection(field, 7);
  await menu(field, page);
  await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await expect(field).toHaveValue("before_middle_after");
  await selection(field, 7, 13);
  await page.evaluate(() => {
    (window as any).__clipboardError = true;
  });
  await menu(field, page);
  await page.getByRole("menuitem", { name: "剪切", exact: true }).click();
  await expect(field).toHaveValue("before_middle_after");
  await expect(page.getByRole("alert")).toContainText("输入内容已保留");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await menu(field, page);
  await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await expect(field).toHaveValue("before_middle_after");
  await menu(field, page);
  await page.getByRole("menuitem", { name: "全选", exact: true }).click();
  await expect(field).toBeFocused();
  expect(
    await field.evaluate(
      (element: HTMLInputElement) =>
        element.selectionEnd! - element.selectionStart!,
    ),
  ).toBe(19);
});

test("templates are sent to Rust only for supported fields and errors include variable parameters", async ({
  page,
}) => {
  await mockDesktop(page, 1);
  await page.goto("/");
  await addFiles(page);
  await page.getByRole("button", { name: "替换", exact: true }).click();
  const find = page.getByLabel("查找内容", { exact: true });
  const replacement = page.getByLabel("替换内容", { exact: true });
  await find.fill("<Date>");
  await find.click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await replacement.fill("<dAtE>_<Name>_<CStem>");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__previewRequests.at(-1)?.rules[0]?.config,
      ),
    )
    .toMatchObject({ find: "<Date>", replacement: "<dAtE>_<Name>_<CStem>" });
  await page.evaluate(() => {
    (window as any).__forcedPreviewError = {
      code: "invalidRule",
      detail: "unknownVariable",
      params: { variable: "TYPO" },
    };
  });
  await replacement.fill("<TYPO>");
  await expect(page.locator(".status-error")).toContainText("未知变量<TYPO>");
  await page.evaluate(() => {
    (window as any).__forcedPreviewError = null;
  });
  await replacement.fill("<Date>");
  await expect(page.locator(".status-error")).toHaveCount(0);
});

test("a pending clipboard action cannot change another rule", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  const field = page.getByLabel("内容", { exact: true });
  await field.fill("original");
  await page.evaluate(() => {
    (window as any).__clipboardDelay = 700;
    (window as any).__clipboardText = "paste";
  });
  await menu(field, page);
  await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  await field.fill("original");
  // A second clipboard call completes after the first, proving its delayed response has arrived.
  await page.evaluate(async () => {
    await (window as any).__TAURI_INTERNALS__.invoke(
      "plugin:clipboard-manager|read_text",
      {},
    );
  });
  await expect(field).toHaveValue("original");
  await expect(page.getByTestId("rule-item").first()).toContainText("original");
  await selection(field, 8);
  await menu(field, page);
  await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await page.getByRole("radio", { name: "补齐", exact: true }).click();
  await expect(field).toHaveValue("originalpaste");
  await expect(
    page.getByRole("radio", { name: "补齐", exact: true }),
  ).toBeChecked();
});

test("missing variables identify the affected row and can be excluded", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.addInitScript(() => {
    const win = window as any;
    const invoke = win.__TAURI_INTERNALS__.invoke;
    win.__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      const result = await invoke(command, args);
      if (command === "preview_rename" && args.rules.length) {
        const row = result.rows[0];
        if (row.selected) {
          row.status = "error";
          row.error = "variableUnavailable";
          row.errorParams = {
            variable: "CreatedDate",
            reason: "createdTimeUnavailable",
          };
          result.conflicts = 1;
        }
      }
      return result;
    };
  });
  await page.goto("/");
  await addFiles(page);
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  await page.getByLabel("内容", { exact: true }).fill("<CreatedDate>_");
  await expect(page.locator("tbody tr").first()).toContainText(
    "变量<CreatedDate>不可用 无法读取创建时间",
  );
  await expect(page.locator("tbody tr").nth(1)).not.toContainText("不可用");
  await expect(
    page.getByRole("button", { name: "执行命名", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "选择对象", exact: true })
    .first()
    .uncheck();
  await expect(page.locator("tbody tr").first()).not.toContainText("不可用");
});

test("browser preview uses Web Clipboard only after a menu action", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  const field = page.getByLabel("内容", { exact: true });
  await field.fill("browser");
  await selection(field, 0, 7);
  await menu(field, page);
  await page.getByRole("menuitem", { name: "复制", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("browser");
  await selection(field, 7);
  await menu(field, page);
  await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
  await expect(field).toHaveValue("browserbrowser");
});
