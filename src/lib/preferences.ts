import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import i18n from "./i18n";

export type Preferences = {
  theme: "system" | "light" | "dark";
  language: "system" | "zh-CN" | "en";
  includeFiles: boolean;
  includeFolders: boolean;
  recursive: boolean;
};
const keys: Record<keyof Preferences, string> = {
  theme: "renamer.theme",
  language: "renamer.language",
  includeFiles: "renamer.includeFiles",
  includeFolders: "renamer.includeFolders",
  recursive: "renamer.recursive",
};

function readPreferences(): Preferences {
  const theme = localStorage.getItem(keys.theme);
  const language = localStorage.getItem(keys.language);
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    language: language === "zh-CN" || language === "en" ? language : "system",
    includeFiles: localStorage.getItem(keys.includeFiles) !== "false",
    includeFolders: localStorage.getItem(keys.includeFolders) !== "false",
    recursive: localStorage.getItem(keys.recursive) === "true",
  };
}

function validatedPatch(input: Partial<Preferences>): Partial<Preferences> {
  const patch: Partial<Preferences> = {};
  if (["system", "light", "dark"].includes(input.theme ?? ""))
    patch.theme = input.theme;
  if (["system", "zh-CN", "en"].includes(input.language ?? ""))
    patch.language = input.language;
  if (typeof input.includeFiles === "boolean")
    patch.includeFiles = input.includeFiles;
  if (typeof input.includeFolders === "boolean")
    patch.includeFolders = input.includeFolders;
  if (typeof input.recursive === "boolean") patch.recursive = input.recursive;
  return patch;
}

export function usePreferences(onError: (error: unknown) => void) {
  const [preferences, setPreferences] = useState(readPreferences);
  const applyPatch = useCallback((input: Partial<Preferences>) => {
    const patch = validatedPatch(input);
    for (const key of Object.keys(patch) as (keyof Preferences)[]) {
      localStorage.setItem(keys[key], String(patch[key]));
    }
    setPreferences((previous) => ({ ...previous, ...patch }));
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      try {
        applyPatch(patch);
      } catch (error) {
        onError({ code: "settingsSave", detail: String(error) });
      }
    },
    [applyPatch, onError],
  );

  useEffect(() => {
    const refresh = () => setPreferences(readPreferences());
    const onStorage = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === null || Object.values(keys).includes(event.key))
      )
        refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    window.addEventListener("languagechange", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("languagechange", refresh);
    };
  }, []);

  useLayoutEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle(
        "dark",
        preferences.theme === "dark" ||
          (preferences.theme === "system" && media.matches),
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences.theme]);

  useEffect(() => {
    const update = () => {
      const language =
        preferences.language === "system"
          ? navigator.language.startsWith("zh")
            ? "zh-CN"
            : "en"
          : preferences.language;
      if (i18n.language !== language)
        void i18n.changeLanguage(language).catch(onError);
    };
    update();
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, [preferences.language, onError]);

  return { preferences, updatePreferences };
}
