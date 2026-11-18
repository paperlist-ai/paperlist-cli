import path from "node:path";
import { expect, test } from "vitest";
import { credentialsPath } from "../../src/paths.js";
import { makeIsolatedHome } from "../helpers/isolated-home.js";

test("isolated home env writes credentials where the platform CLI looks", () => {
  const { home, env, filePath } = makeIsolatedHome("pl-paths-");
  expect(filePath).toBe(credentialsPath(home, env));
  if (process.platform === "win32") {
    expect(filePath).toContain(path.join("AppData", "Roaming", "paperlist"));
    expect(filePath.includes(`${path.sep}.config${path.sep}`)).toBe(false);
  } else if (process.platform === "darwin") {
    expect(filePath).toContain(path.join("Library", "Application Support", "paperlist"));
  } else {
    expect(filePath).toContain(path.join(".config", "paperlist"));
  }
});
