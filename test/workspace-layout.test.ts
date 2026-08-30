import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  deckPositionModeForPileCount,
  deckTopForPileAnchor,
  defaultPilePosition,
} from "../src/workspace-layout.js";

describe("Deck recenter target", () => {
  test("starts centred without a pile and near the bottom with one", () => {
    assert.equal(deckPositionModeForPileCount(0), "centered");
    assert.equal(deckPositionModeForPileCount(1), "bottom");
  });
});

describe("size-aware pile anchor", () => {
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
