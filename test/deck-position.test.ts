import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deckAnchorCenterX, deckAnchorCenterY, deckPositionAxes } from "../src/deck-position.js";
import { bookmarkEdgeTargets, cardMotionStyle, cardFootprint, type DeckGeometry } from "../src/deck-motion.js";
import { deckRenderedIndices } from "../src/deck-render-window.js";

test("horizontal position is the transpose of vertical position", () => {
  for (const [orientation, transpose] of [["horizontal", "vertical"], ["vertical", "horizontal"]] as const) {
    for (const width of [720, 840, 960]) {
      for (const pane of [400, width, width + 1, width + 24, 1200, 2000]) {
        for (const [xMode, yMode] of [["left", "top"], ["centered", "centered"], ["right", "bottom"]] as const) {
          const x = deckAnchorCenterX(pane, width, orientation, xMode);
          assert.equal(x, deckAnchorCenterY(pane, width, transpose, yMode));
          if (pane >= width) {
            assert.ok(x - width / 2 >= 0 && x + width / 2 <= pane);
          } else if (xMode !== "centered") {
            assert.equal(xMode === "left" ? x - width / 2 : pane - x - width / 2, 12);
          }
        }
      }
    }
  }
  assert.equal(deckAnchorCenterX(2000, 840, "horizontal", "left"), 440);
  assert.equal(deckAnchorCenterX(2000, 840, "vertical", "left"), 660);
  for (const pane of [0, -1, NaN, Infinity]) assert.equal(deckAnchorCenterX(pane, 840, "horizontal", "left"), 0);
});

test("position targets identify only the axes they reset", () => {
  for (const target of ["left", "right"] as const) assert.deepEqual(deckPositionAxes(target), { x: true, y: false });
  for (const target of ["top", "bottom"] as const) assert.deepEqual(deckPositionAxes(target), { x: false, y: true });
  assert.deepEqual(deckPositionAxes("centered"), { x: true, y: true });
});

test("shifted horizontal anchors keep culling and bookmark targets consistent with card footprints", () => {
  for (const model of ["drawer", "fan"] as const) {
    for (const mode of ["left", "centered", "right"] as const) {
      const geometry: DeckGeometry = {
        cardWidth: 840, cardHeight: 560, anchorIndex: 100, viewportPosition: 100,
        spread: 0.1, orientation: "horizontal", model, splay: 5, fadeStrength: 1,
        paneExtent: 1800, anchorCoordinate: deckAnchorCenterX(1800, 840, "horizontal", mode), panOffset: 0,
      };
      const indices = deckRenderedIndices(250, geometry);
      for (let index = 0; index < 250; index++) {
        const options = { ...geometry, cardIndex: index };
        const motion = cardMotionStyle(options);
        const half = cardFootprint(options, motion);
        const center = geometry.anchorCoordinate + motion.along;
        if (center + half >= 0 && center - half <= geometry.paneExtent) assert.ok(indices.includes(index));
      }
      const edges = bookmarkEdgeTargets([0, 249], geometry);
      assert.equal(edges.before, 0);
      assert.equal(edges.after, 249);
    }
  }
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
