import assert from "node:assert/strict";
import { test } from "node:test";
import { deckAxis, deckCardDimensions } from "../src/deck-axis.js";
import { cardMotionStyle, cardFootprint, bookmarkEdgeTargets, type DeckGeometry } from "../src/deck-motion.js";
import { deckRenderWindow, deckRenderedIndices, deckTransitionIntersects } from "../src/deck-render-window.js";
import { DeckTransition } from "../src/deck-transition.js";

const geometry: DeckGeometry = { cardWidth: 840, cardHeight: 560, anchorIndex: 100,
  viewportPosition: 100, spread: 0.02, orientation: "vertical", model: "drawer", splay: 5, fadeStrength: 1,
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
        for (const splay of [0, 5])
          for (const panOffset of [-3000, 0, 3000]) {
            const options = { ...geometry, orientation, model, spread, splay, panOffset };
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
  const options = { ...geometry, splay: 0, paneExtent: 800, anchorCoordinate: 400 };
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

// These tests use the same retention predicate as DeckView, with a deterministic clock.
test("continuous Drawer browsing bounds mounted cards before the gesture ends", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    for (const splay of [0, 5]) {
      const transition = new DeckTransition();
      let mounted = new Set<number>();
      let peak = 0;
      for (let frame = 0; frame < 2400; frame++) {
        const now = frame * (1000 / 60);
        const position = 300 + (frame < 1200 ? frame : 2400 - frame) / 6;
        const anchorIndex = Math.round(position);
        const options = { ...geometry, orientation, splay, spread: 0.1,
          paneExtent: 800, anchorCoordinate: 400, anchorIndex, viewportPosition: position };
        if (frame > 0 && frame % 6 === 0) transition.begin(now);
        const wanted = new Set(deckRenderedIndices(10000, options));
        mounted = new Set([...mounted].filter((index) => {
          const displayed = transition.displayedPose(String(index));
          return wanted.has(index) || (transition.active(now, 180) && displayed !== undefined &&
            deckTransitionIntersects(options, displayed, cardMotionStyle({ ...options, cardIndex: index })));
        }));
        for (const index of wanted) mounted.add(index);
        transition.retain(new Set([...mounted].map(String)));
        for (const index of mounted) transition.pose(String(index), cardMotionStyle({ ...options, cardIndex: index }), now, 180);
        peak = Math.max(peak, mounted.size);
        assert.ok(mounted.size <= wanted.size + 8, `unbounded ${orientation}: ${mounted.size} / ${wanted.size}`);
      }
      assert.ok(peak < 50);
    }
  }
});

test("transition retention covers intermediate motion and releases offscreen sweeps", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    const options = { ...geometry, orientation, paneExtent: 800, anchorCoordinate: 400, spread: 0.1 };
    const pose = { along: -1500, across: 0, rotation: -5, scale: 1, opacity: 1 };
    assert.equal(deckTransitionIntersects(options, pose, { ...pose, along: 1500, rotation: 5 }), true);
    assert.equal(deckTransitionIntersects(options, pose, { ...pose, along: -2000 }), false);
    assert.equal(deckTransitionIntersects(options, { ...pose, along: 1500 }, { ...pose, along: 2000 }), false);
    assert.equal(deckTransitionIntersects({ ...options, panOffset: 1500 }, pose, pose), true);
  }
});

test("pruning transition state releases origins as well as displayed poses", () => {
  const transition = new DeckTransition();
  const original = cardMotionStyle({ ...geometry, cardIndex: 100 });
  transition.pose("departed", original, 0, 180);
  transition.begin(10);
  transition.retain(new Set());
  assert.equal(transition.displayedPose("departed"), undefined);
  const target = { ...original, along: 2000 };
  assert.deepEqual(transition.pose("departed", target, 20, 180), target);
});
