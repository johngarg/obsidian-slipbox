import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  activeIndexForViewport,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  clampViewportPosition,
  viewportPositionToRevealCard,
} from "../src/deck-motion.js";

describe("free Deck motion", () => {
  test("keeps card surfaces in one physical stack", () => {
    assert.equal(cardStackOrder(4, 3.75, 4), 220);
    assert.equal(cardStackOrder(3, 3.75, 4), 100);
    assert.equal(cardStackOrder(0, 3.75, 4), 97);
  });

  test("chooses the nearest off-screen bookmark on each side", () => {
    assert.deepEqual(
      bookmarkEdgeTargets([0, 2, 4, 6, 8], 4, 100, 300, 100),
      { left: 2, right: 6 },
    );
    assert.deepEqual(bookmarkEdgeTargets([4], 4, 100, 300, 100), {
      left: null,
      right: null,
    });
    assert.deepEqual(bookmarkEdgeTargets([0, 8], 4, 0, 300, 100), {
      left: null,
      right: null,
    });
  });

  test("keeps the previous active card through the midpoint dead band", () => {
    assert.equal(activeIndexForViewport(0.5, 0, 4), 0);
    assert.equal(activeIndexForViewport(0.55, 0, 4), 0);
    assert.equal(activeIndexForViewport(0.57, 0, 4), 1);
  });

  test("uses hysteresis in the reverse direction to prevent border flicker", () => {
    assert.equal(activeIndexForViewport(0.5, 1, 4), 1);
    assert.equal(activeIndexForViewport(0.45, 1, 4), 1);
    assert.equal(activeIndexForViewport(0.43, 1, 4), 0);
  });

  test("handles a gesture crossing several cards at once", () => {
    assert.equal(activeIndexForViewport(3.8, 0, 6), 4);
    assert.equal(activeIndexForViewport(0.2, 5, 6), 0);
  });

  test("clamps free scrolling at the physical ends of the Deck", () => {
    assert.equal(clampViewportPosition(-2.4, 6), 0);
    assert.equal(clampViewportPosition(2.4, 6), 2.4);
    assert.equal(clampViewportPosition(9, 6), 5);
  });

  test("positions cards continuously without snapping to integer indices", () => {
    assert.deepEqual(cardMotionStyle(2, 1.25, 400), {
      translateX: 300,
      scale: 0.97375,
      opacity: 0.9025,
    });
    assert.equal(cardMotionStyle(1, 1.25, 400).translateX, -100);
  });

  test("keeps the active card legible away from the Deck centre", () => {
    assert.deepEqual(cardMotionStyle(0, 4, 300, true), {
      translateX: -1200,
      scale: 0.98,
      opacity: 1,
    });
    assert.deepEqual(cardMotionStyle(0, 4, 300), {
      translateX: -1200,
      scale: 0.86,
      opacity: 0.48,
    });
  });

  test("arrow navigation does not move an already visible target", () => {
    assert.equal(
      viewportPositionToRevealCard(2, 1.5, 6, 300, 1000, 600),
      1.5,
    );
  });

  test("arrow navigation scrolls only enough to reveal an obscured target", () => {
    assert.equal(
      viewportPositionToRevealCard(2, 1, 6, 400, 1000, 600, 20),
      1.55,
    );
    assert.equal(
      viewportPositionToRevealCard(1, 2, 6, 400, 1000, 600, 20),
      1.45,
    );
  });
});
