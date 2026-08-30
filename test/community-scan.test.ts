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

  test("defines symmetric top, centre, and bottom Deck positions", () => {
    assert.match(
      styles,
      /\.slipbox-deck-view\s*\{[^}]*--slipbox-deck-center:\s*67%;/su,
    );
    assert.match(
      styles,
      /\.slipbox-deck-view\.is-deck-centered-position\s*\{[^}]*--slipbox-deck-center:\s*50%;/su,
    );
    assert.match(
      styles,
      /\.slipbox-deck-view\.is-deck-top-position\s*\{[^}]*--slipbox-deck-center:\s*33%;/su,
    );
  });

  test("avoids broad relational selectors while hiding a dragged card's Branch View", () => {
    assert.doesNotMatch(styles, /:has\(/);
    assert.match(
      styles,
      /\.slipbox-card\.is-dragging-to-desk\s*>\s*\.slipbox-local-branch-view/,
    );
  });

  test("presents the Branch View as an uncapped floating diagram and control rail", () => {
    const viewRule = styles.match(
      /\.slipbox-local-branch-view\s*\{(?<body>[^}]*)\}/u,
    )?.groups?.body ?? "";
    assert.match(viewRule, /max-height:\s*none;/u);
    assert.match(viewRule, /overflow:\s*visible;/u);
    assert.match(viewRule, /border:\s*0;/u);
    assert.match(viewRule, /background:\s*transparent;/u);
    assert.match(viewRule, /box-shadow:\s*none;/u);
    assert.match(
      styles,
      /\.slipbox-local-branch-header\s*\{[^}]*position:\s*absolute;[^}]*display:\s*flex;[^}]*pointer-events:\s*none;/su,
    );
    assert.match(
      styles,
      /button\.slipbox-local-branch-control,[^{]+\{[^}]*pointer-events:\s*auto;/su,
    );
  });

  test("keeps the Branch View stub hit target visually inert", () => {
    assert.doesNotMatch(
      styles,
      /\.slipbox-local-branch-stub[^{,\n]*\sline\b/u,
    );
    assert.match(
      styles,
      /\.slipbox-local-branch-stub-hit\s*\{[^}]*pointer-events:\s*stroke;/su,
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
    assert.match(baseRule, /font-weight:\s*var\(--font-semibold\)/u);
    assert.doesNotMatch(baseRule, /(?:^|;)\s*color\s*:/u);
  });

  test("removes underlines from inert rendered card links", () => {
    assert.match(
      styles,
      /\.slipbox-card-scroll\.markdown-rendered\s+a\[data-slipbox-link-disabled="true"\],[^{]+\{[^}]*text-decoration:\s*none;/su,
    );
  });

  test("separates adaptive card tints from bookmark map rings", () => {
    assert.match(styles, /--slipbox-card-color-tint-strength:\s*5%/u);
    assert.match(styles, /--slipbox-card-bookmark-tint-strength:\s*10%/u);
    assert.match(
      styles,
      /\.theme-dark \.slipbox-card,[^{]+\{[^}]*--slipbox-card-color-tint-strength:\s*8%;[^}]*--slipbox-card-bookmark-tint-strength:\s*12%/su,
    );
    assert.match(
      styles,
      /\.slipbox-deck-map-bookmark-ring\s*\{[^}]*width:\s*8px;[^}]*height:\s*8px;[^}]*border:\s*1px solid var\(--interactive-accent\);[^}]*background:\s*none;/su,
    );
    assert.doesNotMatch(
      styles,
      /\.slipbox-deck-map-marker\.is-bookmarked/u,
    );
  });
});
