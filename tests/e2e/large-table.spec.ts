import { test, expect } from "@playwright/test";
import { mockDesktop, addFiles } from "./helpers/desktop";

test("ten thousand rows are virtualized and scrolling reaches the last row", async ({
  page,
}) => {
  await mockDesktop(page, 10000);
  await page.goto("/");
  await addFiles(page);
  await expect(page.locator(".status-counts")).toContainText("10000");
  await expect(page.locator("tbody tr")).not.toHaveCount(0);
  expect(await page.locator("tbody tr").count()).toBeLessThan(100);
  const first = await page.locator("tbody tr").nth(0).boundingBox();
  const second = await page.locator("tbody tr").nth(1).boundingBox();
  expect(first?.height).toBe(26);
  expect(second!.y - first!.y).toBe(26);
  await page.getByRole("button", { name: /自动编号/ }).click();
  await expect(page.getByRole("button", { name: "执行重命名" })).toBeEnabled();
  await page.locator(".file-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator("tbody")).toContainText("1_image9999.png");
  await page.screenshot({
    path: ".work/screenshots/files.png",
    fullPage: true,
  });
});
test("a late preview response cannot replace the latest parameters", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await addFiles(page);
  await page.getByRole("button", { name: /自动编号/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__previewCalls.includes(1)))
    .toBeTruthy();
  await page.getByLabel("起始值", { exact: true }).fill("2");
  await expect(page.locator("tbody")).toContainText("2_image0.png");
  await page.waitForTimeout(1000);
  await expect(page.locator("tbody")).not.toContainText("1_image0.png");
  await expect(page.getByRole("button", { name: "执行重命名" })).toBeEnabled();
});
