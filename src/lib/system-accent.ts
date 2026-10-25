type Color = readonly [number, number, number];

function luminance(color: Color) {
  return color.reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrast(first: Color, second: Color) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function readableColor(color: Color, surface: Color, dark: boolean): Color {
  const target = dark ? 255 : 0;
  for (let step = 0; step <= 100; step++) {
    const adjusted = color.map((channel) =>
      Math.round(channel + (target - channel) * (step / 100)),
    ) as [number, number, number];
    if (contrast(adjusted, surface) >= 4.5) return adjusted;
  }
  return [target, target, target];
}

// Keep native colors legible for both text on panels and labels on filled controls.
export function accentVariables(value: unknown): Record<string, string> | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255,
    )
  )
    return null;
  const color = value as [number, number, number];
  const variables: Record<string, string> = {};
  for (const [theme, surface, dark] of [
    // Use the most demanding neutral surface, including hover and selection.
    ["light", [231, 231, 231], false],
    ["dark", [46, 46, 46], true],
  ] as const) {
    const primary = readableColor(color, surface, dark);
    const foreground =
      contrast(primary, [255, 255, 255]) >= contrast(primary, [0, 0, 0])
        ? "#ffffff"
        : "#000000";
    variables[`--system-primary-${theme}`] = `rgb(${primary.join(" ")})`;
    variables[`--system-primary-foreground-${theme}`] = foreground;
  }
  return variables;
}
