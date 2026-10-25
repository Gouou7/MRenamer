import { useCallback, useState } from "react";
import type { Layout, LayoutChangedMeta } from "react-resizable-panels";

const key = "mrenamer.sidebar-widths";

export function useSidebarLayout(fallback: Layout | undefined) {
  const [initialLayout] = useState<Layout | undefined>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (
        !saved ||
        !Number.isFinite(saved.library) ||
        !Number.isFinite(saved.sequence)
      )
        return;
      const available = document.documentElement.clientWidth - 2;
      if (available < 740) return;
      const library = Math.min(
        Math.max(180, Math.min(260, saved.library)),
        available - 560,
      );
      const sequence = Math.min(
        Math.max(240, Math.min(440, saved.sequence)),
        available - library - 320,
      );
      return {
        library: (library / available) * 100,
        sequence: (sequence / available) * 100,
        configuration: ((available - library - sequence) / available) * 100,
      };
    } catch {
      // Invalid preference data must not prevent opening the workspace.
    }
  });
  const onLayoutChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      if (!meta.isUserInteraction) return;
      const group = document.getElementById("rule-columns");
      if (!group) return;
      const available = group.clientWidth - 2;
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            library: (layout.library / 100) * available,
            sequence: (layout.sequence / 100) * available,
          }),
        );
      } catch {
        // Storage can be unavailable without affecting the current layout.
      }
    },
    [],
  );
  return { defaultLayout: initialLayout ?? fallback, onLayoutChanged };
}
