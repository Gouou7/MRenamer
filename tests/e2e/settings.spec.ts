import { test, expect } from "@playwright/test";
import { addFiles, mockDesktop, openSettings } from "./helpers/desktop";

test("settings opens once and synchronizes without changing the workspace", async ({
  page,
  context,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await addFiles(page);
  await page.getByRole("button", { name: "自动编号", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("1_image0.png");
  const settings = await openSettings(page);
  await expect(
    settings.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await expect(settings.getByRole("tab")).toHaveCount(0);
  await expect(
    settings.getByRole("group", { name: "外观", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole("group", { name: "载入选项", exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole("button", { name: "可用变量", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__settingsOpenCalls))
    .toBe(2);
  expect(context.pages()).toHaveLength(2);
  await settings.getByRole("combobox", { name: "主题", exact: true }).click();
  await settings.getByRole("option", { name: "深色", exact: true }).click();
  await expect(settings.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await settings.getByRole("combobox", { name: "语言", exact: true }).click();
  await settings.getByRole("option", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(settings).toHaveTitle("Settings - MRenamer");
  await expect(page.getByTestId("rule-item")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("1_image0.png");
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => settings.isClosed()).toBeTruthy();
  const reopened = await openSettings(page, false);
  await expect(
    reopened.getByRole("combobox", { name: "Theme", exact: true }),
  ).toContainText("Dark");
  await reopened.close();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toBeVisible();
});

test("import preferences persist and apply to the next main-window import", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  const settings = await openSettings(page);
  const recursive = settings.getByRole("switch", {
    name: "包含子文件夹内容",
    exact: true,
  });
  await expect(recursive).toBeDisabled();
  await settings
    .getByRole("switch", { name: "载入文件夹内容", exact: true })
    .click();
  await recursive.click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("renamer.recursive")))
    .toBe("true");
  await addFiles(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).__scanCalls.at(-1)))
    .toMatchObject({ contents: true, recursive: true });
  await settings.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  const reopened = await openSettings(page);
  await expect(
    reopened.getByRole("switch", { name: "包含子文件夹内容", exact: true }),
  ).toBeChecked();
});

for (const language of ["zh-CN", "en"]) {
  for (const theme of ["light", "dark"]) {
    test(`settings stays usable at 640px with keyboard navigation ${language} ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("renamer.language", language);
          localStorage.setItem("renamer.theme", theme);
        },
        { language, theme },
      );
      await page.setViewportSize({ width: 640, height: 480 });
      await page.goto("/?view=settings");
      await expect(page.getByRole("tablist")).toHaveCount(0);
      const trigger = page.getByRole("button", {
        name: language === "zh-CN" ? "可用变量" : "Available variables",
        exact: true,
      });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".variable-definitions dt")).toHaveCount(0);
      await expect(page.locator(".settings-header h1")).toHaveCSS(
        "font-size",
        "13px",
      );
      for (const legend of await page
        .locator('[data-slot="field-legend"]')
        .all())
        await expect(legend).toHaveCSS("font-size", "13px");
      for (const label of await page.locator('[data-slot="field-label"]').all())
        await expect(label).toHaveCSS("font-size", "12px");
      for (const field of await page.getByRole("combobox").all())
        await expect(field).toHaveCSS("font-size", "12px");
      await page.getByRole("combobox").first().click();
      for (const option of await page.getByRole("option").all())
        await expect(option).toHaveCSS("font-size", "12px");
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: `.work/screenshots/settings-sections-${language}-${theme}.png`,
        fullPage: true,
      });
      await trigger.focus();
      await page.keyboard.press("Space");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".variable-definitions dt")).toHaveCount(23);
      await page
        .locator(".variable-definitions dt")
        .last()
        .scrollIntoViewIfNeeded();
      await expect(
        page.locator(".variable-definitions dt").last(),
      ).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.work/screenshots/settings-${language}-${theme}.png`,
        fullPage: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".variable-definitions dt")).toHaveCount(0);
      await page.reload();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  }
}

test("a failed settings window open reports an error in the main window", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).__settingsOpenError = true;
  });
  await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  await expect(page.locator(".status-error")).toContainText("无法打开设置窗口");
});
