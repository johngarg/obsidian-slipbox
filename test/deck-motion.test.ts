import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  activeIndexForViewport,
  adjacentBookmarkIndex,
  bookmarkEdgeTargets,
  cardMotionStyle,
  type DeckGeometry,
  cardStackOrder,
  centredViewportPosition,
  clampViewportPosition,
  deckIndexByDelta,
  stationarySelectionOffset,
  setCardMotionOpacity,
  setCardStackOrder,
} from "../src/deck-motion.js";

const geometry: DeckGeometry = {
  cardWidth: 100, cardHeight: 100, anchorIndex: 4, viewportPosition: 4,
  spread: 1, orientation: "horizontal", model: "fan", splay: 0, fadeStrength: 1,
  paneExtent: 300, anchorCoordinate: 150, panOffset: 0,
};

describe("free Deck motion", () => {
  test("chooses the closest bookmark on either side without wrapping", () => {
    const bookmarks = [9, 1, 6, 3, 6];
    assert.equal(adjacentBookmarkIndex(bookmarks, 5, -1), 3);
    assert.equal(adjacentBookmarkIndex(bookmarks, 5, 1), 6);
    assert.equal(adjacentBookmarkIndex(bookmarks, 1, -1), null);
    assert.equal(adjacentBookmarkIndex(bookmarks, 9, 1), null);
    assert.equal(adjacentBookmarkIndex([5], 5, -1), null);
    assert.equal(adjacentBookmarkIndex([5], 5, 1), null);
  });

  test("fans card surfaces around the active card", () => {
    assert.equal(cardStackOrder(4, 4), 220);
    assert.equal(cardStackOrder(3, 4), 99);
    assert.equal(cardStackOrder(0, 4), 96);
  });

  test("stores computed motion in overridable CSS properties", () => {
    const window = new Window();
    const card = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as unknown as HTMLElement;

    setCardStackOrder(card, 220);
    setCardMotionOpacity(card, 0.82);

    assert.equal(card.style.getPropertyValue("--slipbox-card-z-index"), "220");
    assert.equal(card.style.getPropertyValue("--slipbox-card-opacity"), "0.82");
    assert.equal(card.style.zIndex, "");
    assert.equal(card.style.opacity, "");
  });

  test("keeps intervening cards visible when selection does not move the viewport", () => {
    assert.ok(cardStackOrder(0, 0) > cardStackOrder(1, 0));
    assert.ok(cardStackOrder(1, 0) > cardStackOrder(2, 0));

    assert.ok(cardStackOrder(2, 2) > cardStackOrder(1, 2));
    assert.ok(cardStackOrder(1, 2) > cardStackOrder(0, 2));
  });

  test("selects inactive cards without moving the physical viewport", () => {
    const previousIndex = 4;
    const previousOffset = -1.25;
    const previousPosition = previousIndex + previousOffset;
    const nextOffset = stationarySelectionOffset(
      previousIndex,
      2,
      previousOffset,
    );
    assert.equal(2 + nextOffset, previousPosition);
    assert.equal(
      stationarySelectionOffset(previousIndex, previousIndex, previousOffset),
      previousOffset,
    );
  });

  test("chooses the nearest off-screen bookmark on each side", () => {
    assert.deepEqual(
      bookmarkEdgeTargets([0, 2, 4, 6, 8], geometry),
      { before: 2, after: 6 },
    );
    assert.deepEqual(bookmarkEdgeTargets([4], geometry), {
      before: null,
      after: null,
    });
    assert.deepEqual(
      bookmarkEdgeTargets([2, 6], { ...geometry, spread: 0.6 }),
      { before: 2, after: 6 },
    );
    assert.deepEqual(bookmarkEdgeTargets([0, 8], { ...geometry, spread: 0 }), {
      before: null,
      after: null,
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

  test("keeps translation continuous while Fan emphasis follows the selected card", () => {
    const options = { ...geometry, viewportPosition: 2.4, cardWidth: 300 };
    const focused = cardMotionStyle({ ...options, cardIndex: 4 });
    const adjacent = cardMotionStyle({ ...options, cardIndex: 3 });
    const farther = cardMotionStyle({ ...options, cardIndex: 2 });
    assert.equal(focused.along, 480);
    assert.equal(focused.scale, 1);
    assert.equal(adjacent.scale, 0.965);
    assert.ok(Math.abs(farther.scale - 0.93) < 1e-12);
    assert.equal(focused.opacity, 1);
    assert.equal(adjacent.opacity, 0.87);
  });

  test("Drawer opens a full-card gap without raising or shrinking the anchor", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const options = { ...geometry, model: "drawer" as const, orientation, spread: 0.1 };
      assert.equal(cardMotionStyle({ ...options, cardIndex: 3 }).along, -10);
      assert.equal(cardMotionStyle({ ...options, cardIndex: 4 }).along, 0);
      assert.equal(cardMotionStyle({ ...options, cardIndex: 5 }).along, 112);
      assert.equal(cardMotionStyle({ ...options, cardIndex: 6 }).along, 122);
      for (let index = 0; index < 1000; index++) {
        assert.equal(cardMotionStyle({ ...options, cardIndex: index }).scale, 1);
        assert.ok(cardStackOrder(index + 1, 4, "drawer") > cardStackOrder(index, 4, "drawer"));
      }
    }
  });

  test("splay survives anchor changes and vertical Fan never scales", () => {
    const tilted = { ...geometry, splay: 5, orientation: "vertical" as const, cardIndex: 9 };
    const first = cardMotionStyle(tilted);
    const second = cardMotionStyle({ ...tilted, anchorIndex: 5 });
    assert.equal(first.rotation, second.rotation);
    assert.equal(first.across, second.across);
    assert.equal(first.scale, 1);
    assert.equal(cardMotionStyle({ ...tilted, anchorIndex: 9 }).rotation, 0);
    assert.equal(cardMotionStyle({ ...tilted, anchorIndex: 9 }).across, 0);
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


test("fading scales distance attenuation without changing geometry or model floors", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    for (const model of ["drawer", "fan"] as const) {
      const rate = model === "drawer" ? 0.08 : 0.13;
      const floor = model === "drawer" ? 0.45 : 0.42;
      for (const fadeStrength of [0, 0.5, 1, 2]) {
        const options = { ...geometry, orientation, model, fadeStrength };
        assert.equal(cardMotionStyle({ ...options, cardIndex: 4 }).opacity, 1);
        for (const distance of [1, 2, 10, 100]) {
          const before = cardMotionStyle({ ...options, cardIndex: 4 - distance });
          const after = cardMotionStyle({ ...options, cardIndex: 4 + distance });
          const expected = Math.max(floor, 1 - distance * rate * fadeStrength);
          assert.equal(before.opacity, expected);
          assert.equal(after.opacity, expected);
          const baseline = cardMotionStyle({ ...options, fadeStrength: 1, cardIndex: 4 + distance });
          assert.deepEqual({ ...after, opacity: baseline.opacity }, baseline);
        }
      }
    }
  }
});
