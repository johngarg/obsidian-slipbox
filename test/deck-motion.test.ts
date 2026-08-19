import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cardMotionStyle,
  transitionStripOffset,
} from "../src/deck-motion.js";

describe("Deck transition geometry", () => {
  test("places a newly active next card at its former neighbour position", () => {
    const step = 400;
    const stripOffset = transitionStripOffset(1, step);

    assert.equal(cardMotionStyle(0, step, stripOffset).translateX, step);
    assert.equal(cardMotionStyle(-1, step, stripOffset).translateX, 0);
  });

  test("places a newly active previous card at its former neighbour position", () => {
    const step = 400;
    const stripOffset = transitionStripOffset(-1, step);

    assert.equal(cardMotionStyle(0, step, stripOffset).translateX, -step);
    assert.equal(cardMotionStyle(1, step, stripOffset).translateX, 0);
  });

  test("continues a drag snap from the exact released strip position", () => {
    const step = 400;
    const releasedDragOffset = -320;
    const stripOffset = transitionStripOffset(1, step, releasedDragOffset);

    assert.equal(stripOffset, 80);
    assert.equal(cardMotionStyle(0, step, stripOffset).translateX, 80);
    assert.equal(cardMotionStyle(-1, step, stripOffset).translateX, -320);
  });

  test("changes scale and opacity according to physical centre distance", () => {
    assert.deepEqual(cardMotionStyle(0, 400, 0), {
      translateX: 0,
      scale: 1,
      opacity: 1,
    });
    assert.deepEqual(cardMotionStyle(1, 400, 0), {
      translateX: 400,
      scale: 0.965,
      opacity: 0.87,
    });
  });
});
