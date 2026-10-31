import { test, expect } from "@playwright/test";

for (const scenario of [
  {
    name: "desktop-light-zh",
    width: 1440,
    height: 940,
    theme: "light",
    language: "zh-CN",
  },
  {
    name: "desktop-dark-en",
    width: 1440,
    height: 940,
    theme: "dark",
    language: "en",
  },
  {
    name: "tablet-dark-zh",
    width: 1024,
    height: 800,
    theme: "dark",
    language: "zh-CN",
  },
  {
    name: "narrow-light-en",
    width: 760,
    height: 680,
    theme: "light",
    language: "en",
  },
]) {
  test(`controls remain in their own panels ${scenario.name}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    await page.addInitScript(({ theme, language }) => {
      localStorage.setItem("renamer.theme", theme);
      localStorage.setItem("renamer.language", language);
    }, scenario);
    await page.goto("/");
    const chinese = scenario.language === "zh-CN";
    await expect(
      page.getByRole("heading", {
        name: chinese ? "重命名操作" : "Rename actions",
        exact: true,
      }),
    ).toBeVisible();
    for (const text of [
      "批量重命名",
      "本地处理",
      "重命名工作区",
      "文件保留在本机",
      "RENAMER / WORKSPACE",
      "Batch rename",
      "Local processing",
      "Rename workspace",
      "Files stay on this device",
    ]) {
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }
    await expect(page.locator(".header-actions button")).toHaveCount(2);
    await expect(page.locator(".app-header")).toHaveCSS("height", "34px");
    await expect(page.locator(".status-bar")).toHaveCSS("height", "26px");
    for (const button of await page.locator(".header-actions button").all()) {
      await expect(button).toHaveCSS("height", "20px");
    }
    const history = page.locator(".header-actions").getByRole("button", {
      name: chinese ? "操作记录" : "History",
      exact: true,
    });
    await expect(history).toHaveText(chinese ? "操作记录" : "History");
    await expect(history.locator("svg")).toHaveCount(1);
    await expect(history).toHaveCSS(
      "background-color",
      scenario.theme === "light" ? "oklch(0.95 0 0)" : "oklch(0.27 0 0)",
    );
    const execute = page.locator(".header-actions button").first();
    await expect(execute).toHaveAttribute(
      "title",
      chinese ? "执行命名" : "Rename",
    );
    await expect(execute.locator("svg")).toHaveClass(/lucide-check/);
    await expect(page.locator(".library-panel .panel-caption")).toHaveCount(0);
    for (const option of await page.locator(".library-item").all()) {
      await expect(option).toHaveCSS("height", "32px");
      const text = await option.locator("strong").evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
        contentWidth: element.scrollWidth,
        contentHeight: element.scrollHeight,
      }));
      expect(text.contentWidth).toBeLessThanOrEqual(text.width);
      expect(text.contentHeight).toBeLessThanOrEqual(text.height);
      expect(text.height).toBeLessThanOrEqual(30);
    }
    await expect(page.locator(".library-icon").first()).toHaveCSS(
      "border-width",
      "0px",
    );
    await expect(page.getByRole("menubar")).toBeInViewport();
    for (const trigger of await page
      .locator("[data-slot=menubar-trigger]")
      .all()) {
      await expect(trigger).toHaveCSS("font-size", "12px");
      const bounds = (await trigger.boundingBox())!;
      const header = (await page.locator(".app-header").boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(header.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        header.y + header.height,
      );
    }
    await expect(page.locator(".app-header .brand")).toHaveCount(0);
    await expect(page.locator(".app-header h1")).toHaveCount(0);
    await expect(page.locator(".files-heading button")).toHaveCount(0);
    await expect(page.locator(".files-heading input")).toHaveCount(0);
    await expect(page.locator(".files-heading [role=group]")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: chinese ? "设置" : "Settings",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: chinese ? "撤销" : "Undo",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: chinese ? "文件" : "File", exact: true })
      .click();
    for (const name of chinese
      ? ["添加文件", "添加文件夹", "退出"]
      : ["Add files", "Add folders", "Exit"]) {
      await expect(
        page.getByRole("menuitem", { name, exact: true }),
      ).toBeInViewport();
      await expect(page.getByRole("menuitem", { name, exact: true })).toHaveCSS(
        "font-size",
        "12px",
      );
    }
    await page.screenshot({
      path: `.work/screenshots/${scenario.name}-file-menu.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    // Opening the other menus by keyboard keeps the same typography and focus.
    for (const name of chinese ? ["编辑", "关于"] : ["Edit", "About"]) {
      const trigger = page.getByRole("menuitem", { name, exact: true });
      await trigger.focus();
      await trigger.press("ArrowDown");
      const menu = page.getByRole("menu", { name, exact: true });
      await expect(menu).toBeVisible();
      for (const item of await menu.getByRole("menuitem").all()) {
        await expect(item).toHaveCSS("font-size", "12px");
      }
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
    await history.focus();
    await history.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: chinese ? "关闭" : "Close", exact: true })
      .click();
    await expect(history).toBeFocused();
    await page
      .getByRole("button", {
        name: chinese ? "字母大小写" : "Letter case",
        exact: true,
      })
      .click();
    await expect(page.locator(".config-panel")).toBeInViewport();
    const title = (await page
      .locator(".execution-panel .panel-heading h2")
      .boundingBox())!;
    const count = (await page
      .locator(".execution-panel .panel-heading [data-slot=badge]")
      .boundingBox())!;
    expect(count.x - title.x - title.width).toBeGreaterThanOrEqual(0);
    expect(count.x - title.x - title.width).toBeLessThanOrEqual(10);
    expect(
      (await page.getByTestId("rule-item").first().boundingBox())!.height,
    ).toBeLessThanOrEqual(58);
    await expect(page.locator(".config-panel .panel-heading")).toHaveText(
      chinese ? "字母大小写" : "Letter case",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".config-panel").getByRole("radio", {
        name: chinese ? "全部小写" : "lowercase",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".execution-panel").getByRole("heading", {
        name: chinese ? "执行操作" : "Execution",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".header-actions").getByRole("button", {
        name: chinese ? "执行命名" : "Rename",
        exact: true,
      }),
    ).toBeInViewport();
    await expect(
      page.locator(".header-actions").getByRole("button", {
        name: chinese ? "操作记录" : "History",
        exact: true,
      }),
    ).toBeInViewport();
    await expect(page.locator(".execution-actions")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `.work/screenshots/${scenario.name}-compact.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
