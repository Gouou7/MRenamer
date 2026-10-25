import { test, expect } from "@playwright/test";
import { mockDesktop, addFiles } from "./helpers/desktop";
test("errors stay in the footer without moving the workspace", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await addFiles(page);
  const top = (await page.locator(".workbench").boundingBox())!.y;
  await page.evaluate(() => {
    (window as any).__forcedPreviewError = {
      code: "invalidRule",
      detail: "textOrWidth",
    };
  });
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  await expect(page.locator(".status-bar [role=status]")).toContainText(
    "请输入内容并检查目标长度",
  );
  await expect(page.locator("main > [role=alert]")).toHaveCount(0);
  expect((await page.locator(".workbench").boundingBox())!.y).toBe(top);
  await page.evaluate(() => {
    (window as any).__forcedPreviewError = {
      code: "io",
      detail: "Fixture access denied",
    };
  });
  await page
    .locator(".config-panel")
    .getByLabel("内容", { exact: true })
    .fill("prefix_");
  await expect(page.locator(".status-bar [role=status]")).toContainText(
    "无法访问文件",
  );
  await page
    .locator(".status-bar")
    .getByRole("button", { name: "详细信息" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Fixture access denied");
  await page.locator(".notification-details").dblclick();
  expect(
    await page.evaluate(() => window.getSelection()?.toString().length),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  for (const width of [760, 1440]) {
    await page.setViewportSize({ width, height: 940 });
    const content = await page
      .locator(".status-message")
      .evaluate((element) => {
        const bounds = [...element.children].map((child) =>
          child.getBoundingClientRect(),
        );
        return {
          left: Math.min(...bounds.map((box) => box.left)),
          right: Math.max(...bounds.map((box) => box.right)),
        };
      });
    expect((content.left + content.right) / 2).toBeCloseTo(width / 2, 0);
    const counts = (await page.locator(".status-counts").boundingBox())!;
    expect(counts.x + counts.width).toBeLessThan(content.left);
  }
});
test("every rename configuration uses radio groups", async ({ page }) => {
  await page.goto("/");
  for (const name of [
    "添加与补齐",
    "替换",
    "删除与保留",
    "自动编号",
    "移动",
    "字母大小写",
  ]) {
    await page
      .locator(".rule-library")
      .getByRole("button", { name, exact: true })
      .click();
    const config = page.locator(".config-panel");
    await expect(config.getByRole("combobox")).toHaveCount(0);
    await expect(
      config.getByRole("radiogroup", { name: "作用范围" }),
    ).toBeVisible();
    await config.getByRole("radio", { name: "完整名称", exact: true }).click();
    await expect(
      config.getByRole("radio", { name: "完整名称", exact: true }),
    ).toBeChecked();
  }
});
