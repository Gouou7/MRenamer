import { test, expect } from "@playwright/test";
import { mockDesktop, openSettings } from "./helpers/desktop";

for (const language of ["zh-CN", "en"]) {
  for (const theme of ["light", "dark"]) {
    test(`single titlebar fits the narrow desktop window ${language} ${theme}`, async ({
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
      await page.setViewportSize({ width: 760, height: 620 });
      await page.goto("/");
      const header = page.locator(".window-titlebar");
      await expect(header).toHaveCSS("height", "34px");
      await expect(page.locator(".window-controls button")).toHaveCount(3);
      await expect(page.locator(".window-controls")).toHaveCSS(
        "border-left-width",
        "0px",
      );
      await expect(page.locator(".titlebar-name")).toBeHidden();
      const drag = (await page
        .getByTestId("titlebar-drag-region")
        .boundingBox())!;
      expect(drag.width).toBeGreaterThanOrEqual(80);
      for (const item of await page
        .locator(".header-left, .header-actions, .window-controls button")
        .all()) {
        await expect(item).toBeInViewport();
        const bounds = (await item.boundingBox())!;
        expect(bounds.y).toBeLessThan(34);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(34);
      }
      const controls = page.getByRole("group", {
        name: language === "zh-CN" ? "窗口控制" : "Window controls",
        exact: true,
      });
      await controls
        .getByRole("button", {
          name: language === "zh-CN" ? "最小化" : "Minimize",
          exact: true,
        })
        .click();
      await expect
        .poll(() => page.evaluate(() => (window as any).__windowCalls))
        .toContain("plugin:window|minimize");
      await controls
        .getByRole("button", {
          name: language === "zh-CN" ? "最大化" : "Maximize",
          exact: true,
        })
        .focus();
      await page.keyboard.press("Enter");
      const restore = controls.getByRole("button", {
        name: language === "zh-CN" ? "还原窗口" : "Restore window",
        exact: true,
      });
      await expect(restore).toBeVisible();
      await restore.focus();
      await page.keyboard.press("Space");
      await expect(
        controls.getByRole("button", {
          name: language === "zh-CN" ? "最大化" : "Maximize",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.work/screenshots/titlebar-${language}-${theme}.png`,
      });
    });
  }
}

test("dragging is confined to noninteractive titlebar areas and follows native window state", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  const drag = page.getByTestId("titlebar-drag-region");
  await drag.click({ button: "right" });
  expect(await page.evaluate(() => (window as any).__windowCalls)).toEqual([]);
  await drag.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__windowCalls))
    .toContain("plugin:window|start_dragging");
  await drag.dblclick();
  await expect(
    page.getByRole("button", { name: "还原窗口", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).__maximized = false;
    (window as any).__emitWindowEvent("tauri://resize", {
      width: 1000,
      height: 700,
    });
    (window as any).__emitWindowEvent("tauri://blur", false);
  });
  await expect(
    page.getByRole("button", { name: "最大化", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".window-titlebar")).toHaveAttribute(
    "data-focused",
    "false",
  );
  await page.evaluate(() => {
    (window as any).__windowCalls = [];
  });
  await page.getByRole("menuitem", { name: "文件", exact: true }).click();
  await expect(
    page.getByRole("menu", { name: "文件", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => (window as any).__windowCalls)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menu", { name: "文件", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__closeCalls))
    .toBe(1);
});

test("modal dialogs detach the native snap target until they close", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  await expect(page.locator("#window-maximize")).toBeVisible();
  await page.getByRole("menuitem", { name: "关于", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "关于MRenamer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#window-maximize")).toHaveCount(0);
  await expect(page.locator(".window-controls button").nth(1)).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(page.locator("#window-maximize")).toBeVisible();
  await page.getByRole("button", { name: "操作记录", exact: true }).click();
  await expect(page.locator("#window-maximize")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#window-maximize")).toBeVisible();
});

test("settings modal blocks native controls and keeps variables collapsed", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  const settings = await openSettings(page);
  await expect(settings.locator("#window-maximize")).toHaveCount(0);
  await expect(
    settings.locator(".window-controls button").first(),
  ).toBeDisabled();
  await expect(
    settings.getByRole("heading", { name: "设置", exact: true }),
  ).toHaveCSS("font-size", "13px");
  await expect(
    settings.getByRole("button", { name: "可用变量", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await settings.screenshot({
    path: ".work/screenshots/titlebar-settings.png",
  });
  await settings.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(settings.getByRole("dialog")).toHaveCount(0);
  await expect(settings.locator("#window-maximize")).toBeVisible();
});

test("window failures use the existing translated status error", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).__windowError = true;
  });
  await page.getByRole("button", { name: "最小化", exact: true }).click();
  await expect(page.locator(".status-error")).toContainText("无法操作窗口");
  await expect(
    page.getByRole("button", { name: "最大化", exact: true }),
  ).toBeEnabled();
});
