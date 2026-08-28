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

  test("does not use flagged text-decoration thickness", () => {
    assert.doesNotMatch(styles, /text-decoration-thickness\s*:/);
  });

  test("avoids broad relational selectors while hiding dragged-card navigation", () => {
    assert.doesNotMatch(styles, /:has\(/);
    assert.match(
      styles,
      /\.slipbox-desk-card\.is-dragging\s*\+\s*\.slipbox-inferred-navigation/,
    );
  });

  test("gives annotated Desk signatures a stable inline allocation", () => {
    assert.match(
      styles,
      /\.slipbox-desk-card-identity\s*>\s*\.slipbox-card-signature\.has-branch-annotations\s*\{[^}]*flex:\s*0 0 min\([^;]+;[^}]*--slipbox-card-signature-intrinsic-width[^}]*contain:\s*inline-size;/su,
    );
  });

  test("uses only canonical Desk selectors and custom properties", () => {
    assert.doesNotMatch(styles, /tray/iu);
    assert.match(styles, /\[data-desk-card-size="small"\]/u);
    assert.match(
      styles,
      /--slipbox-desk-card-width:\s*min\(/u,
    );
    assert.match(
      styles,
      /--slipbox-desk-pile-height:\s*min\(/u,
    );
  });
});
