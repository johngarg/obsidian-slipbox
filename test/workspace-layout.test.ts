import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  deckPositionModeForPileCount,
  deckTopForPileAnchor,
  defaultPilePosition,
  automaticPileWorkspacePosition,
} from "../src/workspace-layout.js";

describe("Deck recenter target", () => {
  test("starts centred without a pile and near the bottom with one", () => {
    assert.equal(deckPositionModeForPileCount(0), "centered");
    assert.equal(deckPositionModeForPileCount(1), "bottom");
  });
});

describe("size-aware pile anchor", () => {
  test("converts the default cascade into stable workspace coordinates with pan", () => {
    const anchor = { left: 449, top: 252, width: 376, height: 258 };
    const horizontal = { left: 449, top: -73, width: 376, height: 258 };
    const vertical = { left: 837, top: 5, width: 376, height: 258 };
    assert.deepEqual(automaticPileWorkspacePosition(0, horizontal, anchor), { x: 0, y: -325 });
    assert.deepEqual(automaticPileWorkspacePosition(0, vertical, anchor), { x: 388, y: -247 });
    const second = automaticPileWorkspacePosition(1, vertical, anchor)!;
    assert.ok(Math.abs(second.x - 410.56) < 1e-9);
    assert.equal(second.y, -211);
  });

  test("retains fractional geometry and rejects unavailable measurements", () => {
    const bounds = { left: -10.25, top: 12.5, width: 311.75, height: 206.5 };
    const position = automaticPileWorkspacePosition(2, bounds, bounds)!;
    assert.ok(Math.abs(position.x - 37.41) < 1e-9);
    assert.equal(position.y, 72);
    for (const invalid of [{width:0},{height:-1},{left:Number.NaN},{top:Infinity}]) {
      assert.equal(automaticPileWorkspacePosition(0, {...bounds,...invalid}, bounds), null);
      assert.equal(automaticPileWorkspacePosition(0, bounds, {...bounds,...invalid}), null);
    }
  });

  test("keeps the home pile centred and cascades later piles right and down", () => {
    assert.deepEqual(defaultPilePosition(0), { xPercent: 0, y: 0 });
    assert.deepEqual(defaultPilePosition(1), { xPercent: 6, y: 36 });
    assert.deepEqual(defaultPilePosition(3), { xPercent: 18, y: 108 });
  });

  test("uses the Deck's measured centre and footprint", () => {
    assert.equal(deckTopForPileAnchor(560, 500), 310);
    assert.equal(deckTopForPileAnchor(448, 650), 123);
  });

  test("rejects unavailable or invalid layout measurements", () => {
    assert.equal(deckTopForPileAnchor(-1, 500), null);
    assert.equal(deckTopForPileAnchor(448, 0), null);
    assert.equal(deckTopForPileAnchor(Number.NaN, 500), null);
    assert.equal(deckTopForPileAnchor(448, Number.POSITIVE_INFINITY), null);
  });
});
