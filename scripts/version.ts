import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const releaseTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface BuildVersion {
  displayVersion: string;
  packageVersion: string;
  commit: string;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`无法运行Git ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      args[0] === "rev-parse" && args.includes("HEAD")
        ? "无法生成版本号 请在Git仓库中先创建提交"
        : `无法生成版本号 ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

export function resolveVersion(cwd: string = projectRoot): BuildVersion {
  // Pin every lookup to this commit, even if HEAD changes during the build.
  const commit = git(cwd, ["rev-parse", "--verify", "HEAD"]);
  const short = git(cwd, ["rev-parse", "--short=7", commit]);
  const tags = git(cwd, ["tag", "--merged", commit, "--list"])
    .split(/\r?\n/)
    .filter((tag) => releaseTag.test(tag));
  const tag = tags.length
    ? git(cwd, [
        "describe",
        "--tags",
        "--abbrev=0",
        `--candidates=${tags.length}`,
        ...tags.map((name) => `--match=${name}`),
        commit,
      ])
    : null;
  const exact =
    tag !== null && git(cwd, ["rev-parse", `${tag}^{commit}`]) === commit;
  if (!exact && git(cwd, ["rev-parse", "--is-shallow-repository"]) === "true") {
    throw new Error("无法确定祖先Tag 请先执行 git fetch --unshallow --tags");
  }
  const displayVersion = exact ? tag! : `${tag ?? "0.0.0"}-g${short}`;
  return {
    displayVersion,
    packageVersion: displayVersion.replace(/^v/, ""),
    commit,
  };
}

export function getBuildVersion(
  cwd: string = projectRoot,
  environment: NodeJS.ProcessEnv = process.env,
): BuildVersion {
  const snapshot = environment.MRENAMER_BUILD_VERSION;
  if (!snapshot) return resolveVersion(cwd);
  let version: BuildVersion;
  try {
    version = JSON.parse(snapshot);
    if (
      !version ||
      typeof version.displayVersion !== "string" ||
      typeof version.packageVersion !== "string" ||
      typeof version.commit !== "string"
    )
      throw new Error();
  } catch {
    throw new Error("构建版本快照无效");
  }
  const validDisplay =
    releaseTag.test(version.displayVersion) ||
    /^(?:v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|0\.0\.0)-g[0-9a-f]{7,64}$/.test(
      version.displayVersion,
    );
  if (
    !validDisplay ||
    !/^[0-9a-f]{40,64}$/.test(version.commit) ||
    version.packageVersion !== version.displayVersion.replace(/^v/, "") ||
    (version.displayVersion.includes("-g") &&
      !version.commit.startsWith(version.displayVersion.split("-g")[1]))
  ) {
    throw new Error("构建版本快照无效");
  }
  return version;
}

export function withVersionConfig(
  args: string[],
  version: BuildVersion,
): string[] {
  const separator = args.indexOf("--");
  const index = separator === -1 ? args.length : separator;
  return [
    ...args.slice(0, index),
    "--config",
    JSON.stringify({ version: version.packageVersion }),
    ...args.slice(index),
  ];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const version = resolveVersion();
    process.stdout.write(
      `${process.argv.includes("--json") ? JSON.stringify(version) : version.displayVersion}\n`,
    );
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}
