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

  test("gives annotated Desk signatures a stable inline allocation", () => {
    assert.match(
      styles,
      /\.slipbox-tray-card-identity\s*>\s*\.slipbox-card-signature\.has-branch-annotations\s*\{[^}]*flex:\s*0 0 min\([^;]+;[^}]*--slipbox-card-signature-intrinsic-width[^}]*contain:\s*inline-size;/su,
    );
  });
});
