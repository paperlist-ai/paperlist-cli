import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CLI_PATH = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  isolated?: boolean;
  closeStdout?: boolean;
  stdin?: string;
  cwd?: string;
}

const KEPT = ["PATH", "PATHEXT", "SystemRoot", "windir", "ComSpec", "TEMP", "TMP", "HOME"];

function minimalEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of KEPT) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

export function runCli(args: string[], opts: RunOptions = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const base = opts.isolated ? minimalEnv() : { ...process.env };
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...base, ...opts.env })) {
      if (v !== undefined) env[k] = v;
    }
    // Never inherit a real user key into isolated tests.
    if (opts.isolated) delete env.PAPERLIST_API_KEY;

    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env,
      cwd: opts.cwd,
    });
    let stdout = "";
    let stderr = "";
    if (opts.closeStdout) child.stdout.destroy();
    else
      child.stdout.on("data", (d) => {
        stdout += d;
      });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    if (opts.stdin != null) child.stdin.end(opts.stdin);
    else child.stdin.end();
  });
}
