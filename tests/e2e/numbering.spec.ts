import { test, expect } from "@playwright/test";
import { mockDesktop, addFiles } from "./helpers/desktop";

for (const language of ["zh-CN", "en"]) {
  for (const theme of ["light", "dark"]) {
    test(`alphabetic numbering configuration ${language} ${theme}`, async ({
      page,
    }) => {
      await mockDesktop(page, 2);
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("renamer.language", language);
          localStorage.setItem("renamer.theme", theme);
          const win = window as any;
          const invoke = win.__TAURI_INTERNALS__.invoke;
          win.__numberConfigs = [];
          win.__TAURI_INTERNALS__.invoke = (command: string, args: any) => {
            if (command === "preview_rename") {
              const config = args.rules.find(
                (rule: any) => rule.config.type === "number",
              )?.config;
              if (config) win.__numberConfigs.push(config);
            }
            return invoke(command, args);
          };
        },
        { language, theme },
      );
      const zh = language === "zh-CN";
      const names = zh
        ? {
            number: "自动编号",
            numeric: "数字",
            upper: "大写字母",
            lower: "小写字母",
            start: "起始值",
            step: "步长",
            width: "最小位数",
            fill: "补位字符",
            perDirectory: "按目录分别编号",
            suffix: "名称之后",
          }
        : {
            number: "Numbering",
            numeric: "Numbers",
            upper: "Uppercase letters",
            lower: "Lowercase letters",
            start: "Start",
            step: "Increment",
            width: "Minimum digits",
            fill: "Padding character",
            perDirectory: "Restart in each folder",
            suffix: "End",
          };
      await page.goto("/");
      // Import through the connected desktop mock in either language.
      if (zh) await addFiles(page);
      else {
        await page.getByRole("menuitem", { name: "File", exact: true }).click();
        await page
          .getByRole("menuitem", { name: "Add files", exact: true })
          .click();
      }
      await page
        .getByRole("button", { name: names.number, exact: true })
        .click();
      const config = page.locator(".config-panel");
      const radio = (name: string) =>
        config.getByRole("radio", { name, exact: true });
      const field = (name: string) => config.getByLabel(name, { exact: true });
      await expect(radio(names.numeric)).toBeChecked();
      await field(names.width).fill("4");
      await field(names.fill).fill("_");
      await field(names.start).fill("-2");
      await radio(names.numeric).focus();
      await page.keyboard.press("ArrowRight");
      await expect(radio(names.upper)).toBeChecked();
      await expect(radio(names.upper)).toBeFocused();
      await expect(field(names.start)).toHaveValue("1");
      await expect(field(names.width)).toHaveCount(0);
      await expect(field(names.fill)).toHaveCount(0);
      await expect(config).toContainText(
        zh ? "27起为AA或aa" : "27 for AA or aa",
      );
      await field(names.start).fill("26");
      await field(names.step).fill("2");
      await config
        .getByRole("switch", { name: names.perDirectory, exact: true })
        .click();
      await radio(names.suffix).click();
      await expect
        .poll(() => page.evaluate(() => (window as any).__numberConfigs.at(-1)))
        .toMatchObject({
          style: "upper",
          start: 26,
          step: 2,
          perDirectory: true,
          position: { mode: "suffix" },
        });
      await page.setViewportSize({ width: 760, height: 680 });
      await radio(names.lower).click();
      await expect(radio(names.lower)).toBeChecked();
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).__numberConfigs.at(-1)?.style),
        )
        .toBe("lower");
      await expect(page.getByTestId("rule-item")).toContainText(names.lower);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `.work/screenshots/numbering-${language}-${theme}.png`,
        fullPage: true,
      });
      await radio(names.numeric).click();
      await expect(field(names.width)).toHaveValue("4");
      await expect(field(names.fill)).toHaveValue("_");
      await expect(field(names.start)).toHaveValue("26");
      await expect(field(names.step)).toHaveValue("2");
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).__numberConfigs.at(-1)?.style),
        )
        .toBe("numeric");
    });
  }
}
