import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("tracked text files use LF only (no CRLF)", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const crlf: string[] = [];
  for (const rel of files) {
    if (rel.endsWith(".tgz") || rel.endsWith(".png") || rel.endsWith(".jpg")) continue;
    const buf = readFileSync(path.join(root, rel));
    if (buf.includes(13)) crlf.push(rel);
  }
  expect(crlf).toEqual([]);
});
