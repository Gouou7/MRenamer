import { test, expect, type Page } from "@playwright/test";

async function expectWidths(page: Page) {
  for (const [id, min, max] of [
    ["library", 180, 260],
    ["sequence", 240, 440],
    ["configuration", 320, Infinity],
  ] as const) {
    // Panel constraints are reapplied asynchronously by ResizeObserver after viewport changes.
    const width = async () =>
      (await page.locator(`#${id}`).boundingBox())!.width;
    await expect.poll(width, id).toBeGreaterThanOrEqual(min - 1);
    await expect.poll(width, id).toBeLessThanOrEqual(max + 1);
  }
}

test("flat workspace retains all three panels and constrains resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 940 });
  await page.goto("/");
  const workbench = page.locator(".workbench");
  await expect(workbench).toHaveCSS("border-radius", "0px");
  await expect(workbench).toHaveCSS("box-shadow", "none");
  const box = (await workbench.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(1920);
  const header = (await page.locator(".app-header").boundingBox())!;
  const footer = (await page.locator(".status-bar").boundingBox())!;
  expect(box.y).toBe(header.y + header.height);
  expect(box.y + box.height).toBe(footer.y);
  await expect(
    page.locator(".execution-panel [data-slot=empty]"),
  ).toBeVisible();
  await expect(page.locator(".config-panel [data-slot=empty]")).toBeVisible();
  await expectWidths(page);
  const separators = page.locator(
    "[role=separator][aria-orientation=vertical]",
  );
  await expect(separators).toHaveCount(2);
  for (const [index, delta] of [
    [0, 900],
    [1, 1200],
    [1, -1200],
    [0, -900],
  ]) {
    const handle = (await separators.nth(index).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
    await page.mouse.down();
    await page.mouse.move(handle.x + delta, handle.y + 80, { steps: 10 });
    await page.mouse.up();
    await expectWidths(page);
  }
  // Keyboard resizing obeys the same constraints.
  await separators.first().focus();
  await page.keyboard.press("Home");
  await expectWidths(page);
  await page.keyboard.press("End");
  await expectWidths(page);
  for (const width of [760, 1024, 1920]) {
    await page.setViewportSize({ width, height: 940 });
    await expectWidths(page);
    await expect(page.locator(".config-panel")).toBeInViewport();
  }
  await page.reload();
  await expectWidths(page);
});

test("scrollbars leave room for the rule list and configuration controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 620 });
  await page.goto("/");
  // Force classic wide scrollbars even on systems using overlay scrollbars.
  await page.addStyleTag({
    content: `
    .panel-scroll, .rule-library { overflow-y: scroll; }
    .panel-scroll::-webkit-scrollbar, .rule-library::-webkit-scrollbar { width: 18px; height: 18px; }
  `,
  });
  await page.getByRole("button", { name: "自动编号", exact: true }).click();
  for (let i = 0; i < 9; i++) {
    await page
      .getByRole("button", { name: "复制规则", exact: true })
      .last()
      .click();
  }
  await expectWidths(page);
  for (const selector of [
    ".rule-library",
    ".execution-panel .panel-scroll",
    ".config-panel .panel-scroll",
  ]) {
    const dimensions = await page.locator(selector).evaluate((element) => ({
      reserved: element.getBoundingClientRect().width - element.clientWidth,
      width: element.clientWidth,
      contentWidth: element.scrollWidth,
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
    }));
    expect(dimensions.reserved, selector).toBeGreaterThanOrEqual(18);
    expect(dimensions.contentWidth, selector).toBeLessThanOrEqual(
      dimensions.width,
    );
    if (selector !== ".rule-library") {
      expect(dimensions.contentHeight, selector).toBeGreaterThan(
        dimensions.height,
      );
    }
  }
  for (const option of await page.locator(".library-item").all()) {
    await expect(option).toBeInViewport();
  }
  const config = page.locator(".config-panel");
  await config.getByLabel("补位字符", { exact: true }).fill("X");
  await expect(config.getByLabel("补位字符", { exact: true })).toHaveValue("X");
  await page.screenshot({
    path: ".work/screenshots/scrollbar-narrow-flat.png",
  });
});
