import { invoke, isTauri } from "@tauri-apps/api/core";

export async function openSettingsWindow() {
  if (isTauri()) await invoke("open_settings");
  else {
    const popup = window.open(
      "/?view=settings",
      "mrenamer-settings",
      "popup,width=820,height=680",
    );
    if (!popup) throw { code: "settingsOpen", detail: "" };
    popup.focus();
  }
}
