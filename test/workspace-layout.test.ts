import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  deckAnchorCenterY,
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


describe("fixed card positioning", () => {
  test("preserves the preferred positions when the card fits there", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const top = orientation === "vertical" ? 440 : 660;
      assert.equal(deckAnchorCenterY(2000, 560, orientation, "top"), top);
      assert.equal(deckAnchorCenterY(2000, 560, orientation, "centered"), 1000);
      assert.equal(deckAnchorCenterY(2000, 560, orientation, "bottom"), 2000 - top);
    }
  });

  test("keeps all fixed sizes fully visible while resizing the pane", () => {
    for (const orientation of ["horizontal", "vertical"] as const)
      for (const cardHeight of [480, 560, 640])
        for (const paneHeight of [cardHeight, cardHeight + 1, cardHeight + 24, 800, 1200]) {
          const positions = (["top", "centered", "bottom"] as const).map(mode =>
            deckAnchorCenterY(paneHeight, cardHeight, orientation, mode));
          for (const y of positions) {
            assert.ok(y - cardHeight / 2 >= 0);
            assert.ok(y + cardHeight / 2 <= paneHeight);
          }
          assert.ok(positions[0]! <= positions[1]! && positions[1]! <= positions[2]!);
        }
    assert.equal(deckAnchorCenterY(800, 560, "vertical", "top"), 292);
    assert.equal(deckAnchorCenterY(800, 560, "vertical", "bottom"), 508);
  });

  test("exposes the requested edge when the fixed card is taller than the pane", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      assert.equal(deckAnchorCenterY(400, 560, orientation, "top") - 280, 12);
      assert.equal(deckAnchorCenterY(400, 560, orientation, "bottom") + 280, 388);
      assert.equal(deckAnchorCenterY(400, 560, orientation, "centered"), 200);
    }
  });

  test("handles unavailable pane measurements", () => {
    assert.equal(deckAnchorCenterY(0, 560, "vertical", "top"), 0);
    assert.equal(deckAnchorCenterY(Number.NaN, 560, "vertical", "bottom"), 0);
  });
});
