import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { accentVariables } from "./system-accent";

export function useSystemAccent(desktop: boolean) {
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    let revision = 0;
    let applied: string[] = [];
    const update = async () => {
      const current = ++revision;
      // An unavailable system color should never interrupt file operations.
      const color = await invoke<unknown>("system_accent_color").catch(
        () => null,
      );
      if (cancelled || current !== revision) return;
      const variables = accentVariables(color);
      for (const name of applied)
        document.documentElement.style.removeProperty(name);
      applied = Object.keys(variables ?? {});
      for (const [name, value] of Object.entries(variables ?? {})) {
        document.documentElement.style.setProperty(name, value);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void update();
    };
    void update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisible);
      for (const name of applied)
        document.documentElement.style.removeProperty(name);
    };
  }, [desktop]);
}
