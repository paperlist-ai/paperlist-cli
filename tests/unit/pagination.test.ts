import { expect, test } from "vitest";
import { assertLimit, limitCap } from "../../src/client/paperlist.js";
import { ExitError } from "../../src/errors.js";

test("caps match the live server schema", () => {
  expect(limitCap("search", "slim")).toBe(200);
  expect(limitCap("list", "slim")).toBe(250);
  expect(limitCap("search", "full")).toBe(25);
});

test("rejects out-of-range limits", () => {
  expect(() => assertLimit("search", 0, "slim")).toThrow(ExitError);
  expect(() => assertLimit("search", 201, "slim")).toThrow(ExitError);
  expect(() => assertLimit("list", 26, "full")).toThrow(ExitError);
  expect(() => assertLimit("search", 10, "slim")).not.toThrow();
});
