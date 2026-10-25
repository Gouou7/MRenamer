import { test, expect } from "@playwright/test";
test("empty state and rule sequence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "执行操作" })).toBeVisible();
  await expect(
    page.locator(".execution-panel [data-slot=empty]"),
  ).toContainText("从左侧添加规则");
  await expect(page.locator(".config-panel [data-slot=empty]")).toContainText(
    "选择重命名规则",
  );
  await page.getByRole("button", { name: "自动编号" }).click();
  await expect(page.getByRole("heading", { name: "执行操作" })).toBeVisible();
  await expect(page.getByLabel("起始值", { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "替换" }).click();
  await page.getByLabel("查找内容", { exact: true }).fill("old");
  await page.getByLabel("替换内容", { exact: true }).fill("new");
  await expect(page.getByTestId("rule-item")).toHaveCount(2);
  await page.getByRole("button", { name: "上移", exact: true }).last().click();
  await expect(page.getByTestId("rule-item").first()).toContainText("替换");
  await page.getByRole("button", { name: "复制规则" }).first().click();
  await expect(page.getByTestId("rule-item")).toHaveCount(3);
  await page.getByRole("switch", { name: "启用规则" }).first().click();
  await page.screenshot({
    path: ".work/screenshots/light.png",
    fullPage: true,
  });
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "删除规则" }).first().click();
  await expect(page.getByRole("heading", { name: "执行操作" })).toBeVisible();
  await expect(
    page.locator(".execution-panel [data-slot=empty]"),
  ).toBeVisible();
  await expect(page.locator(".config-panel [data-slot=empty]")).toBeVisible();
  expect(errors).toEqual([]);
});
test("theme and language persist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  await page.getByRole("combobox", { name: "主题", exact: true }).click();
  await page.getByRole("option", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("combobox", { name: "语言", exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rename actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Numbering" }).click();
  await page.screenshot({
    path: ".work/screenshots/dark-en.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("heading", { name: "Rename actions" }),
  ).toBeVisible();
});
test("configuration stays editable while the window shrinks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  const config = page.locator(".config-panel");
  await config.getByLabel("内容", { exact: true }).fill("样品_");
  await config.getByRole("radio", { name: "完整名称", exact: true }).click();
  for (const width of [1024, 820, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(config).toBeInViewport();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(config.getByLabel("内容", { exact: true })).toHaveValue(
      "样品_",
    );
    await expect(
      config.getByRole("radio", { name: "完整名称", exact: true }),
    ).toBeChecked();
    await config.getByLabel("内容", { exact: true }).fill("样品_" + width);
    await config.getByLabel("内容", { exact: true }).fill("样品_");
  }
  await expect(config.getByRole("combobox")).toHaveCount(0);
  await config.getByRole("radio", { name: "补齐", exact: true }).click();
  await expect(config.getByLabel("目标长度", { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".work/screenshots/inline-radio.png",
    fullPage: true,
  });
});

test("interface text cannot be selected while input text remains editable", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".library-panel h2").dblclick();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await page.getByRole("button", { name: "添加与补齐", exact: true }).click();
  const input = page.getByLabel("内容", { exact: true });
  await input.fill("样品_A1");
  await input.press("ControlOrMeta+A");
  expect(
    await input.evaluate((element: HTMLInputElement) =>
      element.value.slice(element.selectionStart!, element.selectionEnd!),
    ),
  ).toBe("样品_A1");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
});
