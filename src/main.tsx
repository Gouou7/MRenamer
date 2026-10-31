import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import SettingsApp from "./SettingsApp";
const settingsWindow =
  new URLSearchParams(window.location.search).get("view") === "settings";
document.documentElement.classList.toggle("settings-surface", settingsWindow);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {settingsWindow ? <SettingsApp /> : <App />}
  </React.StrictMode>,
);
