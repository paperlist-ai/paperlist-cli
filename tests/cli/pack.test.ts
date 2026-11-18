import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolveNpmCli, runNpm, selectPackedTarball } from "../../scripts/pack-smoke.mjs";

/**
 * Full pack → install → installed bin checks live in `scripts/pack-smoke.mjs`
 * (`npm run pack:smoke`, CI "Pack smoke"). They are not run inside Vitest:
 * two long execFileSync pack/installs (~35s each on Windows) blocked the
 * worker event loop and surfaced as `[vitest-worker]: Timeout calling
 * "onTaskUpdate"` after all tests had already passed (run 44323192609).
 */
describe("pack helpers", () => {
  test("runNpm invokes node plus npm-cli.js and actually runs npm --version", () => {
    const entry = resolveNpmCli();
    expect(path.basename(entry)).toMatch(/^npm-cli\.(js|cjs)$/);
    const out = runNpm(["--version"], { encoding: "utf8" });
    expect(String(out).trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("selectPackedTarball uses the destination directory, not npm pack stdout", () => {
    const staging = mkdtempSync(path.join(tmpdir(), "pl-pack-name-"));
    try {
      const realName = "paperlist-cli-0.1.0.tgz";
      const fakeStdout = [
        "CLI Building entry: src/cli.ts",
        "ESM dist/cli.js     55.12 KB",
        "ESM ⚡️ Build success in 22ms",
        realName,
      ].join("\n");
      writeFileSync(path.join(staging, realName), "not-a-real-tarball");
      const selected = selectPackedTarball(staging, fakeStdout);
      expect(selected).toBe(path.join(staging, realName));
      expect(selected).not.toContain("Building entry");
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  });
});
