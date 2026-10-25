import { test, expect } from "@playwright/test";
import { mockDesktop, addFiles } from "./helpers/desktop";
import { getBuildVersion } from "../../scripts/version.ts";

test("edit menu retains list actions without search or filters", async ({
  page,
}) => {
  await mockDesktop(page, 2);
  await page.goto("/");
  await addFiles(page);
  const edit = page.getByRole("menuitem", { name: "编辑", exact: true });
  await edit.click();
  await expect(
    page.getByRole("menuitem", { name: "撤销", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "搜索名称", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "处理对象", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "移除所选", exact: true }).click();
  await expect(page.locator(".files-heading [data-slot=badge]")).toHaveText(
    "0",
  );
  await addFiles(page);
  await edit.click();
  await page.getByRole("menuitem", { name: "清空", exact: true }).click();
  await expect(page.locator(".files-heading [data-slot=badge]")).toHaveText(
    "0",
  );
});

test("about and exit menu actions work without extra toolbar buttons", async ({
  page,
}) => {
  await mockDesktop(page, 0);
  await page.goto("/");
  await page.getByRole("menuitem", { name: "关于", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "关于MRenamer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    `版本 ${getBuildVersion().displayVersion}`,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "文件", exact: true }).click();
  await page.getByRole("menuitem", { name: "退出", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__closeCalls))
    .toBe(1);
  await expect(page.locator(".header-actions button")).toHaveCount(2);
  await expect(page.locator(".execution-panel .execution-actions")).toHaveCount(
    0,
  );
});
