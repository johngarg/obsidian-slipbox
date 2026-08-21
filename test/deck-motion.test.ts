import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  activeIndexForViewport,
  bookmarkEdgeTargets,
  cardMotionStyle,
  cardStackOrder,
  centredViewportPosition,
  clampViewportPosition,
  deckIndexByDelta,
} from "../src/deck-motion.js";

describe("free Deck motion", () => {
  test("fans card surfaces around the active card", () => {
    assert.equal(cardStackOrder(4, 4), 220);
    assert.equal(cardStackOrder(3, 4), 99);
    assert.equal(cardStackOrder(0, 4), 96);
  });

  test("keeps intervening cards visible when selection does not move the viewport", () => {
    assert.ok(cardStackOrder(0, 0) > cardStackOrder(1, 0));
    assert.ok(cardStackOrder(1, 0) > cardStackOrder(2, 0));

    assert.ok(cardStackOrder(2, 2) > cardStackOrder(1, 2));
    assert.ok(cardStackOrder(1, 2) > cardStackOrder(0, 2));
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
    assert.deepEqual(
      bookmarkEdgeTargets([2, 6], 4, 60, 300, 100),
      { left: 2, right: 6 },
    );
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

  test("keeps continuous scrolling fractional at the physical ends", () => {
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

  test("sizes cards monotonically around a keyboard-focused card", () => {
    const viewportPosition = 2.4;
    const activeIndex = 4;
    const focused = cardMotionStyle(
      activeIndex,
      viewportPosition,
      300,
      true,
      activeIndex,
    );
    const adjacent = cardMotionStyle(
      activeIndex - 1,
      viewportPosition,
      300,
      false,
      activeIndex,
    );
    const farther = cardMotionStyle(
      activeIndex - 2,
      viewportPosition,
      300,
      false,
      activeIndex,
    );

    assert.ok(focused.scale > adjacent.scale);
    assert.ok(adjacent.scale > farther.scale);
    assert.ok(focused.opacity > adjacent.opacity);
    assert.ok(adjacent.opacity > farther.opacity);
    assert.equal(focused.translateX, 480);
  });

  test("centres discrete navigation targets and clamps Deck boundaries", () => {
    assert.equal(centredViewportPosition(2, 6), 2);
    assert.equal(centredViewportPosition(-1, 6), 0);
    assert.equal(centredViewportPosition(6, 6), 5);
    assert.equal(centredViewportPosition(0, 0), 0);
  });

  test("moves exactly ten Deck positions, clamps, and remains repeatable", () => {
    assert.equal(deckIndexByDelta(15, 10, 40), 25);
    assert.equal(deckIndexByDelta(15, -10, 40), 5);
    assert.equal(deckIndexByDelta(35, 10, 40), 39);
    assert.equal(deckIndexByDelta(4, -10, 40), 0);

    let active = 2;
    active = deckIndexByDelta(active, 10, 40);
    active = deckIndexByDelta(active, 10, 40);
    active = deckIndexByDelta(active, 10, 40);
    assert.equal(active, 32);
  });
});
