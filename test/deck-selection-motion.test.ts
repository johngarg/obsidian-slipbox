import assert from "node:assert/strict";
import { test } from "node:test";
import { cardMotionStyle, cardFootprint, type DeckGeometry } from "../src/deck-motion.js";
import { deckRenderedIndices, deckTransitionIntersects } from "../src/deck-render-window.js";
import { DeckTransition } from "../src/deck-transition.js";

const geometry: DeckGeometry = {
  cardWidth: 840, cardHeight: 560, orientation: "vertical", model: "drawer",
  spread: 0.1, splay: 5, fadeStrength: 1, anchorIndex: 400, viewportPosition: 400.2,
  paneExtent: 1200, anchorCoordinate: 600, panOffset: 3000,
};

test("selection shares progress with pan and seeds newly mounted card poses from source geometry", () => {
  const transition = new DeckTransition();
  const from = cardMotionStyle({ ...geometry, cardIndex: 390 });
  const target = cardMotionStyle({ ...geometry, anchorIndex: 380, viewportPosition: 380, cardIndex: 390 });
  transition.begin(100, { from: { x: 12, y: 3000 }, to: { x: 12, y: 0 }, geometry });
  const pose = transition.pose("390.md", target, 190, 180, 390);
  assert.equal(pose.along, from.along + (target.along - from.along) * 0.875);
  assert.deepEqual(transition.pan(190, 180), { x: 12, y: 375 });
  assert.equal(transition.rendering(190, 180)?.progress, 0.875);
  transition.cancelPan();
  assert.equal(transition.pan(200, 180), null);
  assert.equal(transition.panTarget, null);
  assert.equal(transition.active(200, 180), true);
  transition.reset();
  assert.equal(transition.rendering(200, 180), undefined);
});

test("retention uses distinct displayed and destination workspace origins", () => {
  const pose = { along: 0, across: 0, rotation: 0, scale: 1, opacity: 1 };
  for (const orientation of ["vertical", "horizontal"] as const) {
    const options = { ...geometry, orientation };
    assert.equal(deckTransitionIntersects(options, pose, pose), false);
    assert.equal(deckTransitionIntersects(options, pose, pose, 0), true);
    assert.equal(deckTransitionIntersects({ ...options, panOffset: -3000 }, pose, pose, 3000), true);
  }
});

test("render-window inversion includes every interpolated footprint through pan and gap movement", () => {
  for (const orientation of ["vertical", "horizontal"] as const) {
    for (const spread of [0.1, 0.58, 1.12]) {
      for (const panOffset of [-6000, 6000]) {
        for (const anchorIndex of [360, 410]) {
          const source = { ...geometry, orientation, spread, panOffset };
          const target = { ...source, anchorIndex, viewportPosition: anchorIndex, panOffset: 0 };
          for (const progress of [0, 0.01, 0.25, 0.5, 0.875, 0.99, 1]) {
            const current = { ...target, panOffset: panOffset * (1 - progress) };
            const indices = deckRenderedIndices(1000, current, { source, progress });
            const mounted = new Set(indices);
            assert.ok(mounted.size < 75);
            for (let cardIndex = 0; cardIndex < 1000; cardIndex++) {
              const from = cardMotionStyle({ ...source, cardIndex });
              const to = cardMotionStyle({ ...target, cardIndex });
              const displayed = { ...to,
                along: from.along + (to.along - from.along) * progress,
                rotation: from.rotation + (to.rotation - from.rotation) * progress,
              };
              const half = cardFootprint({ ...current, cardIndex }, displayed);
              const center = current.anchorCoordinate + current.panOffset + displayed.along;
              if (center + half >= 0 && center - half <= current.paneExtent) {
                assert.ok(mounted.has(cardIndex), `${orientation} ${spread} ${panOffset} ${anchorIndex} ${progress}: ${cardIndex}`);
              }
            }
          }
        }
      }
    }
  }
});
