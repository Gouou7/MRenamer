import { test, expect, type Page } from "@playwright/test";
import { mockDesktop, addFiles } from "./helpers/desktop";

async function palette(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const context = document.createElement("canvas").getContext("2d")!;
    const rgb = (value: string) => {
      probe.style.color = value;
      context.fillStyle = getComputedStyle(probe).color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const result = Object.fromEntries(
      [
        "background",
        "foreground",
        "card",
        "popover",
        "secondary",
        "muted",
        "muted-foreground",
        "accent",
        "border",
        "canvas",
        "primary",
        "primary-foreground",
      ].map((name) => [name, rgb(`var(--${name})`)]),
    );
    probe.remove();
    return result;
  });
}

function contrast(first: number[], second: number[]) {
  const luminance = (color: number[]) =>
    color.reduce((sum, channel, index) => {
      const value = channel / 255;
      return (
        sum +
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][index]
      );
    }, 0);
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const theme of ["light", "dark"]) {
  test(`system accent refreshes with neutral surfaces in ${theme} theme`, async ({
    page,
  }) => {
    await mockDesktop(page, 3);
    await page.addInitScript((theme) => {
      localStorage.setItem("renamer.theme", theme);
      (window as any).__accentColor = [0, 120, 212];
    }, theme);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute(
      "style",
      /--system-primary-light/,
    );
    let previous = (await palette(page)).primary;
    await addFiles(page);
    await page.getByRole("button", { name: "自动编号", exact: true }).click();
    await expect(page.locator(".header-actions button").first()).toBeEnabled();
    for (const color of [
      [255, 240, 0],
      [0, 0, 0],
      [255, 255, 255],
      [206, 32, 116],
    ]) {
      await page.evaluate((color) => {
        (window as any).__accentColor = color;
        window.dispatchEvent(new Event("focus"));
      }, color);
      await expect
        .poll(async () => (await palette(page)).primary)
        .not.toEqual(previous);
      const colors = await palette(page);
      previous = colors.primary;
      for (const [name, rgb] of Object.entries(colors)) {
        if (name.startsWith("primary")) continue;
        expect(Math.max(...rgb) - Math.min(...rgb), name).toBeLessThanOrEqual(
          1,
        );
      }
      for (const surface of ["card", "muted", "accent"]) {
        expect(
          contrast(colors.primary, colors[surface]),
          surface,
        ).toBeGreaterThanOrEqual(4.45);
      }
      expect(
        contrast(colors.primary, colors["primary-foreground"]),
      ).toBeGreaterThanOrEqual(4.45);
      await expect(page.locator(".rule-item.is-active")).toHaveCSS(
        "background-color",
        theme === "light" ? "oklch(0.955 0 0)" : "oklch(0.255 0 0)",
      );
    }
    await page.evaluate(() => {
      (window as any).__accentColor = [0, 120, 212];
      window.dispatchEvent(new Event("focus"));
    });
    await expect
      .poll(async () => (await palette(page)).primary)
      .not.toEqual(previous);
    const native = (await palette(page)).primary;
    await expect(page.locator(".header-actions button").first()).toHaveCSS(
      "background-color",
      `rgb(${native.join(", ")})`,
    );
    await page.screenshot({
      path: `.work/screenshots/system-accent-${theme}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.evaluate(() => {
      (window as any).__accentUnavailable = true;
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.locator("html")).not.toHaveAttribute(
      "style",
      /--system-primary-light/,
    );
    const fallback = (await palette(page)).primary;
    expect(fallback).toEqual([52, 120, 247]);
    await expect(page.locator(".status-error")).toHaveCount(0);
  });

  for (const platform of ["desktop", "browser"]) {
    test(`${platform} defaults to #3478F7 in ${theme} theme`, async ({
      page,
    }) => {
      if (platform === "desktop") await mockDesktop(page, 0);
      await page.addInitScript((theme) => {
        localStorage.setItem("renamer.theme", theme);
      }, theme);
      await page.goto("/");
      await expect
        .poll(async () => (await palette(page)).primary)
        .toEqual([52, 120, 247]);
      if (platform === "desktop") {
        // Invalid native values use the same fallback as unavailable colors.
        for (const color of [[256, 0, 0], [52, 120], "#3478F7"]) {
          await page.evaluate(() => {
            (window as any).__accentColor = [206, 32, 116];
            window.dispatchEvent(new Event("focus"));
          });
          await expect(page.locator("html")).toHaveAttribute(
            "style",
            /--system-primary-light/,
          );
          await page.evaluate((color) => {
            (window as any).__accentColor = color;
            window.dispatchEvent(new Event("focus"));
          }, color);
          await expect(page.locator("html")).not.toHaveAttribute(
            "style",
            /--system-primary-light/,
          );
          await expect
            .poll(async () => (await palette(page)).primary)
            .toEqual([52, 120, 247]);
        }
      }
      expect(
        contrast(
          (await palette(page)).primary,
          (await palette(page))["primary-foreground"],
        ),
      ).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator(".status-error")).toHaveCount(0);
    });
  }
}
