import { test, expect } from "@playwright/test";
import { addFiles, mockDesktop, openSettings } from "./helpers/desktop";

test("settings stays in the main window and preserves the workspace", async ({
  page,
  context,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await addFiles(page);
  await page.getByRole("button", { name: "自动编号", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("1_image0.png");
  await openSettings(page);
  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "关闭", exact: true });
  await expect(close).toHaveText("");
  await expect(close.locator("svg")).toHaveCount(1);
  expect(context.pages()).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__settingsOpenCalls)).toBe(
    0,
  );
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  for (const name of ["外观", "载入选项"])
    await expect(
      dialog.getByRole("group", { name, exact: true }),
    ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "可用变量", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await dialog.getByRole("combobox", { name: "主题", exact: true }).click();
  await page.getByRole("option", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await dialog.getByRole("combobox", { name: "语言", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Settings", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-settings-entry]")).toBeFocused();
  await expect(page.getByTestId("rule-item")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("1_image0.png");
  await openSettings(page, false);
  await expect(
    page.getByRole("combobox", { name: "Theme", exact: true }),
  ).toContainText("Dark");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toBeVisible();
});

test("import preferences persist and apply to the next import", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await openSettings(page);
  const recursive = page.getByRole("switch", {
    name: "包含子文件夹内容",
    exact: true,
  });
  await expect(recursive).toBeDisabled();
  await page
    .getByRole("switch", { name: "载入文件夹内容", exact: true })
    .click();
  await recursive.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await addFiles(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).__scanCalls.at(-1)))
    .toMatchObject({ contents: true, recursive: true });
  await page.reload();
  await openSettings(page);
  await expect(
    page.getByRole("switch", { name: "包含子文件夹内容", exact: true }),
  ).toBeChecked();
});

for (const language of ["zh-CN", "en"]) {
  for (const theme of ["light", "dark"]) {
    test(`settings accordion and keyboard at 760px ${language} ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("renamer.language", language);
          localStorage.setItem("renamer.theme", theme);
        },
        { language, theme },
      );
      await page.setViewportSize({ width: 760, height: 620 });
      await page.goto("/");
      const zh = language === "zh-CN";
      await openSettings(page, zh);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("tablist")).toHaveCount(0);
      await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveCSS(
        "font-size",
        "13px",
      );
      const trigger = dialog.getByRole("button", {
        name: zh ? "可用变量" : "Available variables",
        exact: true,
      });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(dialog.locator('[data-slot="accordion-item"]')).toHaveCount(
        1,
      );
      await expect(dialog.locator(".variable-definitions dt")).toHaveCount(0);
      for (const label of await dialog
        .locator('[data-slot="field-label"]')
        .all())
        await expect(label).toHaveCSS("font-size", "12px");
      for (const field of await dialog.getByRole("combobox").all())
        await expect(field).toHaveCSS("font-size", "12px");
      await dialog.getByRole("combobox").first().click();
      for (const option of await page.getByRole("option").all())
        await expect(option).toHaveCSS("font-size", "12px");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: `.work/screenshots/settings-dialog-${language}-${theme}.png`,
      });
      await trigger.focus();
      await page.keyboard.press("Space");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(dialog.locator(".variable-definitions dt")).toHaveCount(23);
      await expect(dialog.locator('[data-slot="accordion-content"]')).toHaveCSS(
        "--accordion-panel-height",
        "auto",
      );
      await dialog
        .locator(".variable-definitions dt")
        .last()
        .scrollIntoViewIfNeeded();
      await expect(
        dialog.locator(".variable-definitions dt").last(),
      ).toBeInViewport();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(620);
      expect(
        await dialog
          .locator(".settings-content")
          .evaluate((element) => element.scrollHeight > element.clientHeight),
      ).toBeTruthy();
      await expect(
        dialog.locator(".variable-definitions code").last(),
      ).toHaveCSS("user-select", "text");
      await page.screenshot({
        path: `.work/screenshots/settings-accordion-${language}-${theme}.png`,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await openSettings(page, zh);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  }
}

test("failed preference writes are reported inside settings", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "renamer.theme") throw new Error("Storage unavailable");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("combobox", { name: "主题", exact: true }).click();
  await page.getByRole("option", { name: "深色", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "无法保存设置",
  );
  await expect(
    page.getByRole("combobox", { name: "主题", exact: true }),
  ).toContainText("跟随系统");
});
