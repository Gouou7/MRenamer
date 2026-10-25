import { test, expect, type Page } from "@playwright/test";

async function dimensions(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ["library", "sequence", "configuration", "rules", "files"].map((id) => {
        const box = document.getElementById(id)!.getBoundingClientRect();
        return [id, id === "rules" || id === "files" ? box.height : box.width];
      }),
    ),
  );
}

test("panel widths and workspace height survive closing and reopening", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.goto("/");
  const before = await dimensions(page);
  const sideHandles = page.locator(
    "[role=separator][aria-orientation=vertical]",
  );
  for (const [index, delta] of [
    [0, 30],
    [1, 70],
  ]) {
    const box = (await sideHandles.nth(index).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 70);
    await page.mouse.down();
    await page.mouse.move(box.x + delta, box.y + 70, { steps: 8 });
    await page.mouse.up();
  }
  const divider = (await page
    .locator("[role=separator][aria-orientation=horizontal]")
    .boundingBox())!;
  await page.mouse.move(divider.x + 600, divider.y + divider.height / 2);
  await page.mouse.down();
  await page.mouse.move(divider.x + 600, divider.y + 65, { steps: 8 });
  await page.mouse.up();
  const saved = await dimensions(page);
  expect(Math.abs(saved.library - before.library)).toBeGreaterThan(20);
  expect(Math.abs(saved.sequence - before.sequence)).toBeGreaterThan(20);
  expect(Math.abs(saved.rules - before.rules)).toBeGreaterThan(50);
  await page.setViewportSize({ width: 1100, height: 940 });
  await expect
    .poll(async () =>
      Math.abs((await dimensions(page)).library - saved.library),
    )
    .toBeLessThan(2);
  await expect
    .poll(async () =>
      Math.abs((await dimensions(page)).sequence - saved.sequence),
    )
    .toBeLessThan(2);
  const beforeClose = await dimensions(page);
  expect(Math.abs(beforeClose.library - saved.library)).toBeLessThan(2);
  expect(Math.abs(beforeClose.sequence - saved.sequence)).toBeLessThan(2);
  await page.close();
  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 1100, height: 940 });
  await reopened.goto("/");
  for (const [id, size] of Object.entries(beforeClose)) {
    await expect
      .poll(async () => Math.abs((await dimensions(reopened))[id] - size))
      .toBeLessThan(2);
  }
  // Automatic constraints in a smaller window must not replace the saved preference.
  await reopened.setViewportSize({ width: 760, height: 680 });
  await reopened.close();
  const wide = await context.newPage();
  await wide.goto("/");
  for (const [id, size] of Object.entries(saved)) {
    await expect
      .poll(async () => Math.abs((await dimensions(wide))[id] - size))
      .toBeLessThan(2);
  }
  await wide.getByRole("button", { name: "添加补齐", exact: true }).click();
  for (const [id, size] of Object.entries(saved)) {
    expect(Math.abs((await dimensions(wide))[id] - size)).toBeLessThan(2);
  }
  await wide.close();
});

test("rule cards match the two-row action layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".rule-library .lucide-plus")).toHaveCount(0);
  await page.getByRole("button", { name: "自动编号", exact: true }).click();
  const item = page.getByTestId("rule-item");
  await expect(item.locator(".rule-item-heading .rule-index")).toHaveText("01");
  await expect(item.locator(".rule-item-heading .rule-name")).toHaveText(
    "自动编号",
  );
  await expect(
    item.locator(".rule-item-heading .rule-summary"),
  ).not.toBeEmpty();
  await expect(item.locator(".rule-item-heading [role=switch]")).toHaveCount(0);
  const footer = item.locator(".rule-item-footer");
  for (const name of ["拖动排序", "上移", "下移", "复制规则", "删除规则"]) {
    await expect(
      footer.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(footer.getByRole("switch", { name: "启用规则" })).toBeVisible();
  const actions = await footer
    .locator("button, [role=switch]")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("aria-label")),
    );
  expect(actions).toEqual([
    "拖动排序",
    "上移",
    "下移",
    "复制规则",
    "删除规则",
    "启用规则",
  ]);
  await page.screenshot({ path: ".work/screenshots/rule-card-reference.png" });
  await footer.getByRole("switch", { name: "启用规则" }).click();
  await expect(item).toHaveClass(/is-disabled/);
  await page
    .locator(".rule-library")
    .getByRole("button", { name: "替换", exact: true })
    .click();
  const drag = page
    .getByRole("button", { name: "拖动排序", exact: true })
    .first();
  const start = (await page.getByTestId("rule-item").first().boundingBox())!.y;
  await drag.focus();
  await drag.press("Space");
  await expect(page.locator(".rule-item.is-dragging")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      async () =>
        (await page.locator(".rule-item.is-dragging").boundingBox())!.y,
    )
    .toBeGreaterThan(start + 20);
  await page.keyboard.press("Space");
  await expect(
    page.getByTestId("rule-item").first().locator(".rule-name"),
  ).toHaveText("替换");
});
