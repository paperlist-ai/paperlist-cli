import { afterEach, expect, test, vi } from "vitest";
import { ExitError } from "../../src/errors.js";
import { emitJson, emitJsonError } from "../../src/output/emit.js";
import { printPaperList } from "../../src/output/human.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const so = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  const se = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  return {
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
    restore: () => {
      so.mockRestore();
      se.mockRestore();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("success JSON goes only to stdout", () => {
  const io = capture();
  emitJson({ ok: true, papers: [], paging: { next_cursor: null, has_more: false } });
  expect(JSON.parse(io.stdout())).toEqual({
    ok: true,
    papers: [],
    paging: { next_cursor: null, has_more: false },
  });
  expect(io.stderr()).toBe("");
  io.restore();
});

test("JSON errors go only to stderr", () => {
  const io = capture();
  emitJsonError(new ExitError("auth", "Sign-in required"));
  expect(io.stdout()).toBe("");
  expect(JSON.parse(io.stderr())).toEqual({
    ok: false,
    error: { code: "auth_required", message: "Sign-in required" },
  });
  io.restore();
});

test("human list states empty results and paging", () => {
  const io = capture();
  printPaperList(
    { papers: [], paging: { next_cursor: "abc", has_more: true } },
    'paperlist search "q"',
  );
  expect(io.stdout()).toContain("No papers found.");
  expect(io.stdout()).toContain("--cursor abc");
  expect(io.stderr()).toBe("");
  io.restore();
});

test("human titles cannot inject control sequences", () => {
  const io = capture();
  printPaperList(
    {
      papers: [
        {
          id: "x",
          title: "Bad\x1b[31mTitle",
          conference: "iclr",
          year: 2025,
          url: "https://example.com",
        },
      ],
      paging: { next_cursor: null, has_more: false },
    },
    "paperlist search q",
  );
  expect(io.stdout()).not.toContain("\x1b");
  expect(io.stdout()).toContain("Bad[31mTitle");
  expect(io.stdout()).toContain("No more pages.");
  io.restore();
});
