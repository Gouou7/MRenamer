import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { getBuildVersion } from "./scripts/version.ts";
const version = getBuildVersion();
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "build-version",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: `${JSON.stringify(version, null, 2)}\n`,
        });
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(version.displayVersion) },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 1420, strictPort: true },
  clearScreen: false,
});
