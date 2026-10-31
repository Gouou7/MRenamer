import { test, expect } from "@playwright/test";
import { mockDesktop } from "./helpers/desktop";

for (const language of ["zh-CN", "en"]) {
  for (const theme of ["light", "dark"]) {
    test(`history bottom drawer scrolls and restores focus ${language} ${theme}`, async ({
      page,
    }) => {
      await mockDesktop(page, 0);
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("renamer.language", language);
          localStorage.setItem("renamer.theme", theme);
          (window as any).__historyEntries = Array.from(
            { length: 60 },
            (_, index) => ({
              id: `history-${index}`,
              created: 1700000000 - index,
              status: "completed",
              count: index + 1,
              detail: `Operation detail ${index}`,
              pendingPaths: [],
            }),
          );
        },
        { language, theme },
      );
      await page.setViewportSize({ width: 760, height: 620 });
      await page.goto("/");
      const zh = language === "zh-CN";
      const opener = page.getByRole("button", {
        name: zh ? "操作记录" : "History",
        exact: true,
      });
      await opener.click();
      const drawer = page.getByRole("dialog", {
        name: zh ? "操作记录" : "History",
        exact: true,
      });
      await expect(drawer).toHaveAttribute("data-swipe-direction", "down");
      await expect(drawer.locator('[data-slot="drawer-title"]')).toHaveCSS(
        "font-size",
        "13px",
      );
      await expect(drawer.locator(".history-item")).toHaveCount(60);
      await expect(drawer.locator(".history-item button")).toHaveCount(1);
      await drawer
        .locator(".history-item")
        .first()
        .getByText(zh ? "详细信息" : "Details", { exact: true })
        .click();
      await expect(drawer.locator("pre").first()).toHaveText(
        "Operation detail 0",
      );
      await expect(drawer.locator("pre").first()).toHaveCSS(
        "user-select",
        "text",
      );
      await drawer.locator(".history-item").last().scrollIntoViewIfNeeded();
      await expect(drawer.locator(".history-item").last()).toBeInViewport();
      await expect(drawer).toBeVisible();
      const bounds = (await drawer.boundingBox())!;
      expect(bounds.x).toBe(0);
      expect(bounds.width).toBe(760);
      expect(bounds.y).toBeGreaterThan(100);
      expect(Math.abs(bounds.y + bounds.height - 620)).toBeLessThan(2);
      await page.screenshot({
        path: `.work/screenshots/history-drawer-${language}-${theme}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(page.locator("#window-maximize")).toBeVisible();
    });
  }
}

test("history undo still uses the backend command and refreshes the records", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.addInitScript(() => {
    (window as any).__historyEntries = [
      {
        id: "operation",
        created: 1700000000,
        status: "completed",
        count: 3,
        detail: "",
        pendingPaths: [],
      },
    ];
  });
  await page.goto("/");
  await page.getByRole("button", { name: "操作记录", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "撤销", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__undoCalls))
    .toEqual(["operation"]);
  await expect(
    drawer.getByRole("button", { name: "撤销", exact: true }),
  ).toHaveCount(0);
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator(".status-bar")).toContainText("已恢复3项");
});

test("history drawer supports a swipe down to dismiss", async ({ page }) => {
  await mockDesktop(page, 0);
  await page.setViewportSize({ width: 760, height: 620 });
  await page.goto("/");
  await page.getByRole("button", { name: "操作记录", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("暂无操作记录", { exact: true })).toBeVisible();
  await page.locator('[data-slot="drawer-swipe-handle"]').hover();
  const handle = (await page
    .locator('[data-slot="drawer-swipe-handle"]')
    .boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, 615, { steps: 15 });
  await page.mouse.up();
  await expect(drawer).toHaveCount(0);
});
