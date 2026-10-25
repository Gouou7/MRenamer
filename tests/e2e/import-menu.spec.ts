import { test, expect } from "@playwright/test";
import { mockDesktop } from "./helpers/desktop";

test("file menu opens the appropriate file or folder picker", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await expect(page.locator(".files-heading").getByRole("button")).toHaveCount(
    0,
  );
  const file = page.getByRole("menuitem", { name: "文件", exact: true });
  await file.click();
  await page.getByRole("menuitem", { name: "添加文件", exact: true }).click();
  await expect(page.locator(".status-counts")).toContainText("2");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).__dialogCalls))
    .toEqual([{ multiple: true, directory: false }]);
  // The menubar also supports keyboard access to the folder picker.
  await file.focus();
  await page.keyboard.press("ArrowDown");
  const folder = page.getByRole("menuitem", {
    name: "添加文件夹",
    exact: true,
  });
  await folder.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).__dialogCalls))
    .toEqual([
      { multiple: true, directory: false },
      { multiple: true, directory: true },
    ]);
  await expect(page.locator(".files-heading [data-slot=badge]")).toHaveText(
    "2",
  );
  await expect(page.getByRole("menu")).toHaveCount(0);
});
