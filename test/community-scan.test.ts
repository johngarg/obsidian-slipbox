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

  test("uses a quiet theme-aware outline for rendered branch links", () => {
    assert.match(
      styles,
      /a\.slipbox-explicit-branch-link\s*\{[^}]*border:\s*1px solid var\(--background-modifier-border-hover\);[^}]*border-radius:\s*var\(--radius-s\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su,
    );
    const baseRule = styles.match(
      /a\.slipbox-explicit-branch-link\s*\{(?<body>[^}]*)\}/u,
    )?.groups?.body ?? "";
    assert.doesNotMatch(baseRule, /font-weight\s*:/u);
    assert.doesNotMatch(baseRule, /(?:^|;)\s*color\s*:/u);
  });

  test("removes underlines from inert rendered card links", () => {
    assert.match(
      styles,
      /\.slipbox-card-scroll\.markdown-rendered\s+a\[data-slipbox-link-disabled="true"\],[^{]+\{[^}]*text-decoration:\s*none;/su,
    );
  });
});
