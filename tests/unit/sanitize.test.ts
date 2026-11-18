import { describe, expect, test } from "vitest";
import { sanitizeText, sanitizeUnknown } from "../../src/output/sanitize.js";

describe("sanitizeText", () => {
  test("strips ASCII controls from titles", () => {
    expect(sanitizeText("Hello\x1b[31mWorld\x07")).toBe("Hello[31mWorld");
    expect(sanitizeText("A\nB")).toBe("AB");
  });

  test("optionally keeps newlines", () => {
    expect(sanitizeText("A\nB", { allowNewlines: true })).toBe("A\nB");
  });

  test("strips bidi overrides", () => {
    expect(sanitizeText("ok\u202eex")).toBe("okex");
  });
});

describe("sanitizeUnknown", () => {
  test("walks objects", () => {
    expect(sanitizeUnknown({ title: "X\x00Y", n: 1 })).toEqual({ title: "XY", n: 1 });
  });
});
