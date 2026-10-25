import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { resolveVersion, withVersionConfig } from "./version.ts";

// Keep caller-relative arguments and avoid persistent changes to the user's PATH.
const [tool, ...args] = process.argv.slice(2);
const environment = { ...process.env };
const pathKey =
  Object.keys(environment).find((key) => key.toLowerCase() === "path") ||
  "PATH";
const cargoBin = join(
  environment.CARGO_HOME || join(homedir(), ".cargo"),
  "bin",
);
const cargo = join(
  cargoBin,
  process.platform === "win32" ? "cargo.exe" : "cargo",
);
if (existsSync(cargo))
  environment[pathKey] = cargoBin + delimiter + (environment[pathKey] || "");

let executable;
let parameters;
if (tool === "tauri") {
  const require = createRequire(import.meta.url);
  executable = process.execPath;
  parameters = [
    join(dirname(require.resolve("@tauri-apps/cli/package.json")), "tauri.js"),
    ...args,
  ];
  if (
    args.some((arg) => ["build", "dev", "bundle"].includes(arg)) &&
    !args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))
  ) {
    try {
      const version = resolveVersion();
      environment.MRENAMER_BUILD_VERSION = JSON.stringify(version);
      parameters = [parameters[0], ...withVersionConfig(args, version)];
      process.stdout.write(`App version: ${version.displayVersion}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
  }
} else if (tool === "cargo") {
  executable = existsSync(cargo) ? cargo : "cargo";
  parameters = args;
} else {
  throw new Error("Expected cargo or tauri");
}
const child = spawn(executable, parameters, {
  stdio: "inherit",
  env: environment,
  windowsHide: true,
});
child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
