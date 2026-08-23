import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  deckTopForPileAnchor,
  defaultPilePosition,
} from "../src/workspace-layout.js";

describe("size-aware pile anchor", () => {
  test("keeps the home pile centred and cascades later piles to the left", () => {
    assert.deepEqual(defaultPilePosition(0), { xPercent: 0, y: 0 });
    assert.deepEqual(defaultPilePosition(1), { xPercent: -12, y: 0 });
    assert.deepEqual(defaultPilePosition(3), { xPercent: -36, y: 0 });
  });

  test("uses the measured Deck footprint at its permanent centre", () => {
    assert.equal(deckTopForPileAnchor(1000, 500), 250);
    assert.equal(deckTopForPileAnchor(800, 700), 50);
  });

  test("rejects unavailable or invalid layout measurements", () => {
    assert.equal(deckTopForPileAnchor(0, 500), null);
    assert.equal(deckTopForPileAnchor(800, 0), null);
    assert.equal(deckTopForPileAnchor(Number.NaN, 500), null);
    assert.equal(deckTopForPileAnchor(800, Number.POSITIVE_INFINITY), null);
  });
});
