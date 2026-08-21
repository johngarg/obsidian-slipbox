import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  centerViewedCardState,
  createViewedCardState,
  moveViewedCardState,
  renameViewedCardState,
  scrollViewedCardState,
} from "../src/viewed-card.js";

describe("viewed card state", () => {
  test("starts centred and preserves one card identity", () => {
    const state = createViewedCardState("Cards/one.md");
    assert.deepEqual(state, {
      path: "Cards/one.md",
      x: 0,
      y: 0,
      scrollTop: 0,
    });
    assert.deepEqual(renameViewedCardState(state, "Cards/two.md"), {
      ...state,
      path: "Cards/two.md",
    });
  });

  test("constrains movement to the visible stage", () => {
    const state = createViewedCardState("Cards/one.md");
    const moved = moveViewedCardState(state, 900, -900, {
      stageWidth: 1_000,
      stageHeight: 700,
      cardWidth: 600,
      cardHeight: 400,
      margin: 20,
    });
    assert.equal(moved.x, 180);
    assert.equal(moved.y, -130);
    assert.deepEqual(centerViewedCardState(moved), state);
  });

  test("centres cards too large for the stage and clamps scroll", () => {
    const state = createViewedCardState("Cards/one.md");
    assert.deepEqual(moveViewedCardState(state, 30, 40, {
      stageWidth: 320,
      stageHeight: 240,
      cardWidth: 500,
      cardHeight: 300,
    }), state);
    assert.equal(scrollViewedCardState(state, -12).scrollTop, 0);
    assert.equal(scrollViewedCardState(state, 42).scrollTop, 42);
  });
});
