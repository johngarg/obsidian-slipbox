import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { arbitrateShortcut } from "../src/shortcut-arbitration.js";

describe("Slipbox shortcut arbitration", () => {
  test("lets a customized Obsidian hotkey win and reports the conflict", () => {
    let runs = 0;
    let warnings = 0;
    assert.equal(arbitrateShortcut(
      true,
      false,
      () => { runs += 1; },
      () => { warnings += 1; },
    ), "conflict");
    assert.equal(runs, 0);
    assert.equal(warnings, 1);
  });

  test("does not rerun an action already dispatched as an Obsidian command", () => {
    let runs = 0;
    let warnings = 0;
    assert.equal(arbitrateShortcut(
      true,
      true,
      () => { runs += 1; },
      () => { warnings += 1; },
    ), "command");
    assert.equal(runs, 0);
    assert.equal(warnings, 0);
  });

  test("runs the scoped Slipbox shortcut when Obsidian leaves it unclaimed", () => {
    let runs = 0;
    assert.equal(arbitrateShortcut(
      false,
      false,
      () => { runs += 1; },
      () => assert.fail("unexpected conflict"),
    ), "slipbox");
    assert.equal(runs, 1);
  });
});
