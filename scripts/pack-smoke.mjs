#!/usr/bin/env node
/**
 * Pack the package into a clean directory, inspect the tarball, and run the
 * published bin. prepack/build may write to stdout; this script never uses
 * that stdout as a filename (CI previously failed for exactly that reason).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Resolve the npm CLI JavaScript entry so we can run `node npm-cli.js ...`
 * with execFile. Windows cannot execFile "npm" (ENOENT) or "npm.cmd" (EINVAL)
 * without a shell; we do not spawn a shell.
 */
export function resolveNpmCli() {
  const candidates = [];
  if (process.env.npm_execpath) candidates.push(process.env.npm_execpath);
  const prefix = path.dirname(process.execPath);
  candidates.push(path.join(prefix, "node_modules", "npm", "bin", "npm-cli.js"));
  candidates.push(path.join(prefix, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"));
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error(
    `Unable to resolve npm CLI entry. Looked at npm_execpath and npm-cli.js next to ${process.execPath}`,
  );
}

function stdioIgnoringStdin(stdio, encoding) {
  if (stdio == null) {
    return encoding ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"];
  }
  if (stdio === "inherit") return ["ignore", "inherit", "inherit"];
  if (stdio === "pipe" || stdio === "overlapped") return ["ignore", "pipe", "pipe"];
  if (Array.isArray(stdio)) return ["ignore", stdio[1] ?? "pipe", stdio[2] ?? "pipe"];
  return stdio;
}

export function runNpm(args, opts = {}) {
  // npm may block forever on an inherited/piped stdin (seen as 30s test
  // timeouts on Windows after the CLI entry itself started correctly).
  const { stdio, encoding, ...rest } = opts;
  return execFileSync(process.execPath, [resolveNpmCli(), ...args], {
    ...rest,
    encoding,
    stdio: stdioIgnoringStdin(stdio, encoding),
  });
}

export function selectPackedTarball(destinationDir, _npmPackStdout = "") {
  // Intentionally ignore npm pack stdout: prepack/build logs are written there
  // and are not a tarball path (see CI run 44319251202).
  void _npmPackStdout;
  const names = readdirSync(destinationDir).filter((f) => f.endsWith(".tgz"));
  if (names.length !== 1) {
    throw new Error(
      `expected exactly one tarball in ${destinationDir}, found: ${names.join(", ") || "(none)"}`,
    );
  }
  return path.join(destinationDir, names[0]);
}

function cleanEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith("npm_")) continue;
    env[k] = v;
  }
  return env;
}

export function packToDirectory(destinationDir, { ignoreScripts = false } = {}) {
  const args = ["pack", "--pack-destination", destinationDir];
  if (ignoreScripts) args.splice(1, 0, "--ignore-scripts");
  runNpm(args, { cwd: root, env: cleanEnv(), stdio: "inherit" });
  return selectPackedTarball(destinationDir);
}

function listing(tarball) {
  return execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function assertPublishedContents(tarball) {
  const files = listing(tarball);
  if (!files.includes("package/dist/cli.js")) {
    throw new Error(`tarball missing package/dist/cli.js:\n${files.join("\n")}`);
  }
  if (!files.includes("package/package.json") || !files.includes("package/README.md") || !files.includes("package/LICENSE")) {
    throw new Error(`tarball missing required package files:\n${files.join("\n")}`);
  }
  const banned = files.filter(
    (f) =>
      f.includes(".env") ||
      f.includes("credentials") ||
      f.includes("package/tests/") ||
      f.includes("oauth-session") ||
      f.startsWith("package/src/"),
  );
  if (banned.length) {
    throw new Error(`tarball contains unexpected paths:\n${banned.join("\n")}`);
  }
  return files;
}

function runBin(tarball) {
  const installDir = mkdtempSync(path.join(tmpdir(), "pl-pack-install-"));
  try {
    mkdirSync(installDir, { recursive: true });
    runNpm(["install", "--ignore-scripts", "--prefix", installDir, tarball], {
      cwd: installDir,
      env: cleanEnv(),
      stdio: "inherit",
    });
    // Use the installed JS entry with node; .bin/paperlist is a .cmd shim on Windows
    // and cannot be execFile'd without a shell (same EINVAL class as npm.cmd).
    const cli = path.join(installDir, "node_modules", "@paperlist", "cli", "dist", "cli.js");
    const version = execFileSync(process.execPath, [cli, "--version"], { encoding: "utf8" }).trim();
    const help = execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
    if (version !== "0.1.1") throw new Error(`unexpected version: ${version}`);
    if (!help.includes("conferences")) throw new Error("help output missing conferences");
    process.stdout.write(`pack-smoke ok version=${version} tarball=${path.basename(tarball)}\n`);
  } finally {
    rmSync(installDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dest = mkdtempSync(path.join(tmpdir(), "pl-pack-dest-"));
  try {
    const tarball = packToDirectory(dest);
    assertPublishedContents(tarball);
    runBin(tarball);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}
