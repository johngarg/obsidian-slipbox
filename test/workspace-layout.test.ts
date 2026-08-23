import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  deckTopForPileAnchor,
  defaultPilePosition,
} from "../src/workspace-layout.js";

describe("size-aware pile anchor", () => {
  test("keeps the home pile closest to the Deck and stacks later piles upward", () => {
    assert.deepEqual(defaultPilePosition(0), { x: 0, y: 0 });
    assert.deepEqual(defaultPilePosition(1), { x: 0, y: -42 });
    assert.deepEqual(defaultPilePosition(3), { x: 0, y: -126 });
  });

  test("uses the measured Deck footprint at the preserved 62 percent centre", () => {
    assert.equal(deckTopForPileAnchor(1000, 500), 370);
  });

  test("caps a pre-pile Deck to its future with-piles height", () => {
    assert.equal(deckTopForPileAnchor(800, 700), 248);
  });

  test("rejects unavailable or invalid layout measurements", () => {
    assert.equal(deckTopForPileAnchor(0, 500), null);
    assert.equal(deckTopForPileAnchor(800, 0), null);
    assert.equal(deckTopForPileAnchor(Number.NaN, 500), null);
    assert.equal(deckTopForPileAnchor(800, Number.POSITIVE_INFINITY), null);
  });
});
