import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  preventPointerActivatedButtonFocus,
  releasePointerActivatedButtonFocus,
} from "../src/pointer-button-focus.js";

describe("pointer-activated card-header controls", () => {
  test("prevent pointer presses from transferring focus to the control or card", () => {
    let preventDefaultCount = 0;
    let stopPropagationCount = 0;

    preventPointerActivatedButtonFocus({
      preventDefault: () => { preventDefaultCount += 1; },
      stopPropagation: () => { stopPropagationCount += 1; },
    });

    assert.equal(preventDefaultCount, 1);
    assert.equal(stopPropagationCount, 1);
  });

  test("release DOM focus after a pointer click", () => {
    let blurCount = 0;
    const released = releasePointerActivatedButtonFocus(
      { blur: () => { blurCount += 1; } },
      { detail: 1 },
    );

    assert.equal(released, true);
    assert.equal(blurCount, 1);
  });

  test("retain DOM focus for keyboard and assistive activation", () => {
    let blurCount = 0;
    const released = releasePointerActivatedButtonFocus(
      { blur: () => { blurCount += 1; } },
      { detail: 0 },
    );

    assert.equal(released, false);
    assert.equal(blurCount, 0);
  });
});
