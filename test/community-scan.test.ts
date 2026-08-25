import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";

describe("community scanner CSS compatibility", () => {
  const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

  test("does not depend on important declarations", () => {
    assert.doesNotMatch(styles, /!important\b/);
  });

  test("does not use partially supported display contents", () => {
    assert.doesNotMatch(styles, /display\s*:\s*contents\b/);
  });
});
