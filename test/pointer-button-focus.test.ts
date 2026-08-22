import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { releasePointerActivatedButtonFocus } from "../src/pointer-button-focus.js";

describe("pointer-activated card-header controls", () => {
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
