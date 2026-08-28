import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";

describe("inline filing editor styles", () => {
  const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

  test("keeps the Desk editor inside a stable header allocation", () => {
    assert.match(
      styles,
      /\.slipbox-desk-card\.is-filing-source\s+\.slipbox-desk-card-identity\s*>\s*\.slipbox-card-signature\s*\{[^}]*flex:\s*0 1 min\(42%, 14rem\);[^}]*width:\s*min\(42%, 14rem\);[^}]*min-width:\s*84px;/su,
    );
    assert.match(
      styles,
      /\.slipbox-desk-card-address\.is-editing\s*\{[^}]*flex:\s*1 1 auto;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*none;/su,
    );
    assert.match(
      styles,
      /input\[type="text"\]\.slipbox-desk-filing-input\s*\{[^}]*box-sizing:\s*border-box;[^}]*height:\s*21px;[^}]*min-height:\s*21px;[^}]*margin:\s*0;[^}]*box-shadow:\s*none;/su,
    );
  });

  test("uses an unclipped inset focus treatment", () => {
    assert.match(
      styles,
      /input\[type="text"\]\.slipbox-desk-filing-input:focus[^{]*\{[^}]*box-shadow:\s*inset 0 0 0 1px/su,
    );
    assert.doesNotMatch(
      styles,
      /\.slipbox-desk-filing-input\s*\{[^}]*margin:\s*-2px 0;/su,
    );
  });
});
