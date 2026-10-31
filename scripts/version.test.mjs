import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  cpSync,
  symlinkSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveVersion,
  getBuildVersion,
  withVersionConfig,
  projectRoot,
} from "./version.ts";

function run(cwd, executable, args, environment = {}) {
  const env = { ...process.env, ...environment };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `${executable} ${args.join(" ")}\n${result.stderr}\n${result.stdout}`,
  );
  return result.stdout.trim();
}

function fixture(t, commit = true) {
  const dir = mkdtempSync(join(tmpdir(), "mrenamer-version-"));
  t.after(() => {
    const target = realpathSync(dir);
    assert.equal(dirname(target), realpathSync(tmpdir()));
    assert.ok(basename(target).startsWith("mrenamer-version-"));
    rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  const git = (...args) => run(dir, "git", args);
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Version Test");
  git("config", "user.email", "version-test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  const hooks = join(dir, ".git", "empty-hooks");
  mkdirSync(hooks);
  git("config", "core.hooksPath", hooks);
  let count = 0;
  const next = () => {
    writeFileSync(join(dir, "fixture.txt"), String(++count));
    git("add", "fixture.txt");
    git("commit", "--quiet", "-m", `Commit ${count}`);
  };
  if (commit) next();
  return { dir, git, next, short: () => git("rev-parse", "--short=7", "HEAD") };
}

test("uses an exact lightweight release tag including its v prefix", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.2.3");
  assert.deepEqual(resolveVersion(f.dir), {
    displayVersion: "v1.2.3",
    packageVersion: "1.2.3",
    commit: f.git("rev-parse", "HEAD"),
  });
});

test("supports annotated tags", (t) => {
  const f = fixture(t);
  f.git("tag", "-a", "v2.3.4", "-m", "Release");
  assert.equal(resolveVersion(f.dir).displayVersion, "v2.3.4");
  f.next();
  assert.equal(resolveVersion(f.dir).displayVersion, `v2.3.4-g${f.short()}`);
});

test("appends the current commit hash after the nearest release tag", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.2.3");
  f.next();
  const version = resolveVersion(f.dir);
  assert.equal(version.displayVersion, `v1.2.3-g${f.short()}`);
  assert.equal(version.packageVersion, `1.2.3-g${f.short()}`);
});

test("uses 0.0.0 and the hash when no ancestor has a release tag", (t) => {
  const f = fixture(t);
  assert.equal(resolveVersion(f.dir).displayVersion, `0.0.0-g${f.short()}`);
});

test("rejects partial, prefixed, prerelease, metadata and noncanonical tags", (t) => {
  const f = fixture(t);
  for (const tag of [
    "1.2.3",
    "release-v1.2.3",
    "v1.2",
    "v1.2.3.4",
    "v1.2.3-beta",
    "v1.2.3+build",
    "v01.2.3",
    "v1.02.3",
    "v1.2.03",
    "v1.2.3suffix",
  ])
    f.git("tag", tag);
  assert.equal(resolveVersion(f.dir).displayVersion, `0.0.0-g${f.short()}`);
});

test("ignores a closer invalid tag and finds the valid ancestor", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.0.0");
  f.next();
  f.git("tag", "v9.0.0-beta");
  f.next();
  assert.equal(resolveVersion(f.dir).displayVersion, `v1.0.0-g${f.short()}`);
});

test("nearest ancestor is based on history rather than the largest version", (t) => {
  const f = fixture(t);
  f.git("tag", "v9.0.0");
  f.next();
  f.git("tag", "v1.0.0");
  f.next();
  assert.equal(resolveVersion(f.dir).displayVersion, `v1.0.0-g${f.short()}`);
});

test("ignores a tagged commit that is not an ancestor", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.0.0");
  f.git("checkout", "--quiet", "-b", "other");
  f.next();
  f.git("tag", "v9.0.0");
  f.git("checkout", "--quiet", "main");
  f.next();
  assert.equal(resolveVersion(f.dir).displayVersion, `v1.0.0-g${f.short()}`);
});

test("keeps the exact tag even when the working tree has changes", (t) => {
  const f = fixture(t);
  f.git("tag", "v0.0.0");
  writeFileSync(join(f.dir, "fixture.txt"), "uncommitted");
  assert.equal(resolveVersion(f.dir).displayVersion, "v0.0.0");
});

test("uses at least seven hash digits independent of core.abbrev", (t) => {
  const f = fixture(t);
  f.git("config", "core.abbrev", "12");
  assert.equal(resolveVersion(f.dir).displayVersion, `0.0.0-g${f.short()}`);
  assert.match(f.short(), /^[a-f0-9]{7}$/);
});

test("fails clearly for a repository without a commit", (t) => {
  const f = fixture(t, false);
  assert.throws(() => resolveVersion(f.dir), /先创建提交/);
});

test("requires full history for a development version in a shallow clone", (t) => {
  const source = fixture(t);
  source.git("tag", "v1.0.0");
  source.next();
  const clone = fixture(t, false);
  // Clone into a fresh child so the fixture cleanup still owns the entire directory.
  const destination = join(clone.dir, "shallow");
  run(clone.dir, "git", [
    "clone",
    "--quiet",
    "--depth=1",
    pathToFileURL(source.dir).href,
    destination,
  ]);
  assert.throws(() => resolveVersion(destination), /unshallow/);
  run(destination, "git", ["tag", "v2.0.0"]);
  assert.equal(resolveVersion(destination).displayVersion, "v2.0.0");
});

test("passes the same snapshot to frontend and native version configuration", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.2.3");
  f.next();
  const version = resolveVersion(f.dir);
  f.next();
  assert.deepEqual(
    getBuildVersion(f.dir, { MRENAMER_BUILD_VERSION: JSON.stringify(version) }),
    version,
  );
  const args = withVersionConfig(
    ["build", "--config", "custom.json", "--", "--locked"],
    version,
  );
  assert.deepEqual(args.slice(-4), [
    "--config",
    JSON.stringify({ version: version.packageVersion }),
    "--",
    "--locked",
  ]);
  assert.deepEqual(args.slice(0, 3), ["build", "--config", "custom.json"]);
});

test("rejects an inconsistent build snapshot", (t) => {
  const f = fixture(t);
  const version = resolveVersion(f.dir);
  assert.throws(
    () =>
      getBuildVersion(f.dir, {
        MRENAMER_BUILD_VERSION: JSON.stringify({
          ...version,
          packageVersion: "9.9.9",
        }),
      }),
    /快照无效/,
  );
  for (const snapshot of ["null", "{}", "{broken-json"]) {
    assert.throws(
      () => getBuildVersion(f.dir, { MRENAMER_BUILD_VERSION: snapshot }),
      /快照无效/,
    );
  }
});

test("Tauri wrapper rejects an unborn HEAD and forwards one version snapshot", (t) => {
  const f = fixture(t, false);
  mkdirSync(join(f.dir, "scripts"));
  for (const name of ["toolchain.mjs", "version.ts"])
    cpSync(join(projectRoot, "scripts", name), join(f.dir, "scripts", name));
  writeFileSync(
    join(f.dir, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  const cli = join(f.dir, "node_modules", "@tauri-apps", "cli");
  mkdirSync(cli, { recursive: true });
  writeFileSync(
    join(cli, "package.json"),
    JSON.stringify({ name: "@tauri-apps/cli", type: "module" }),
  );
  writeFileSync(
    join(cli, "tauri.js"),
    "console.log(JSON.stringify({ args: process.argv.slice(2), version: JSON.parse(process.env.MRENAMER_BUILD_VERSION) }));",
  );
  const entry = join(f.dir, "scripts", "toolchain.mjs");
  const failed = spawnSync(process.execPath, [entry, "tauri", "build"], {
    cwd: f.dir,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /先创建提交/);
  f.next();
  f.git("tag", "v3.2.1");
  const output = run(f.dir, process.execPath, [
    entry,
    "tauri",
    "build",
    "--config",
    "custom.json",
    "--",
    "--locked",
  ]);
  const forwarded = JSON.parse(output.split(/\r?\n/).at(-1));
  assert.deepEqual(forwarded.version, resolveVersion(f.dir));
  assert.deepEqual(forwarded.args, [
    "build",
    "--config",
    "custom.json",
    "--config",
    '{"version":"3.2.1"}',
    "--",
    "--locked",
  ]);
});

test(
  "a real frontend build embeds its Git version and emits matching metadata",
  { timeout: 120000 },
  (t) => {
    const f = fixture(t);
    for (const name of ["src", "scripts", "assets"])
      cpSync(join(projectRoot, name), join(f.dir, name), { recursive: true });
    for (const name of [
      ".gitignore",
      "package.json",
      "index.html",
      "vite.config.ts",
      "playwright.config.ts",
      "tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.node.json",
    ])
      cpSync(join(projectRoot, name), join(f.dir, name));
    f.git("add", ".");
    f.git("commit", "--quiet", "-m", "Application build fixture");
    f.git("tag", "v1.2.3");
    f.next();
    const version = resolveVersion(f.dir);
    f.next();
    symlinkSync(
      join(projectRoot, "node_modules"),
      join(f.dir, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const environment = { MRENAMER_BUILD_VERSION: JSON.stringify(version) };
    const current = resolveVersion(f.dir);
    assert.deepEqual(
      JSON.parse(
        run(f.dir, process.execPath, [
          join(f.dir, "scripts/version.ts"),
          "--json",
        ]),
      ),
      current,
    );
    run(
      f.dir,
      process.execPath,
      [join(f.dir, "node_modules/vite/bin/vite.js"), "build"],
      { MRENAMER_BUILD_VERSION: "" },
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.dir, "dist/version.json"), "utf8")),
      current,
    );
    run(
      f.dir,
      process.execPath,
      [join(f.dir, "node_modules/typescript/bin/tsc"), "-b"],
      environment,
    );
    run(
      f.dir,
      process.execPath,
      [join(f.dir, "node_modules/vite/bin/vite.js"), "build"],
      environment,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.dir, "dist/version.json"), "utf8")),
      version,
    );
    const bundled = readdirSync(join(f.dir, "dist/assets"))
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(join(f.dir, "dist/assets", name), "utf8"))
      .join("\n");
    assert.ok(bundled.includes(version.displayVersion));
  },
);
