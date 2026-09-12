import assert from "node:assert/strict";
import { test } from "node:test";
import { deckAxis, deckCardDimensions } from "../src/deck-axis.js";
import { cardMotionStyle, cardFootprint, bookmarkEdgeTargets, type DeckGeometry } from "../src/deck-motion.js";
import { deckRenderWindow, deckRenderedIndices } from "../src/deck-render-window.js";
import { DeckTransition } from "../src/deck-transition.js";

const geometry: DeckGeometry = { cardWidth: 840, cardHeight: 560, anchorIndex: 100,
  viewportPosition: 100, spread: 0.02, orientation: "vertical", model: "drawer", tilt: 5,
  paneExtent: 1800, anchorCoordinate: 900, panOffset: 0 };

test("fixed card sizes and axis mapping", () => {
  assert.deepEqual(deckCardDimensions("small"), { width: 720, height: 480 });
  assert.deepEqual(deckCardDimensions("medium"), { width: 840, height: 560 });
  assert.deepEqual(deckCardDimensions("large"), { width: 960, height: 640 });
  assert.deepEqual(deckAxis("vertical").screen(10, 20), { x: 20, y: 10 });
});

test("culling contains every intersecting rotated footprint at every layout extreme", () => {
  for (const orientation of ["horizontal", "vertical"] as const)
    for (const model of ["drawer", "fan"] as const)
      for (const spread of [0.02, 0.58, 1.12])
        for (const tilt of [0, 5])
          for (const panOffset of [-3000, 0, 3000]) {
            const options = { ...geometry, orientation, model, spread, tilt, panOffset };
            const window = deckRenderWindow(300, options);
            assert.ok(window);
            assert.ok(window.start <= 100 && window.end >= 100);
            for (let index = 0; index < 300; index++) {
              const card = { ...options, cardIndex: index };
              const motion = cardMotionStyle(card);
              const half = cardFootprint(card, motion);
              const centre = options.anchorCoordinate + panOffset + motion.along;
              if (centre + half >= 0 && centre - half <= options.paneExtent) {
                assert.ok(index >= window.start && index <= window.end, JSON.stringify({ options, index, window }));
              }
            }
          }
  const window = deckRenderWindow(300, geometry);
  assert.ok(window && window.end - window.start > 48);
  assert.equal(deckRenderWindow(0, geometry), null);
  assert.deepEqual(deckRenderWindow(1, { ...geometry, anchorIndex: 0, viewportPosition: 0 }), { start: 0, end: 0 });
});

test("bookmarks use Drawer gap and spatial pan", () => {
  const options = { ...geometry, tilt: 0, paneExtent: 800, anchorCoordinate: 400 };
  assert.equal(bookmarkEdgeTargets([99, 101], options).after, 101);
  assert.equal(bookmarkEdgeTargets([99], { ...options, panOffset: -500 }).before, 99);
});

test("interrupted Drawer transitions resume from their displayed pose", () => {
  const transition = new DeckTransition();
  const original = cardMotionStyle({ ...geometry, cardIndex: 100 });
  const target = { ...original, along: 500, rotation: 3, opacity: 0.5 };
  assert.deepEqual(transition.pose("a", original, 0, 300), original);
  transition.begin(10);
  assert.deepEqual(transition.pose("a", target, 10, 300), original);
  const middle = transition.pose("a", target, 160, 300);
  assert.ok(middle.along > 0 && middle.along < 500);
  transition.begin(160);
  assert.deepEqual(transition.pose("a", original, 160, 300), middle);
  assert.deepEqual(transition.pose("a", original, 460, 300), original);
  assert.equal(transition.active(460, 300), false);
  transition.reset();
  assert.deepEqual(transition.pose("a", target, 460, 300), target);
});

test("far spatial panning pins the anchor without rendering intervening cards", () => {
  const indices = deckRenderedIndices(10000, { ...geometry, panOffset: -30000 });
  assert.ok(indices.includes(100));
  assert.ok(indices.length < 300);
  assert.ok(indices.some((index) => index > 2000));
  assert.equal(indices.includes(1000), false);
});

test("spatial panning can put an earlier bookmark at the after edge", () => {
  assert.equal(bookmarkEdgeTargets([99], { ...geometry, panOffset: 3000 }).after, 99);
});
