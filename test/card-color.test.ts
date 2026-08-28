import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  CARD_COLORS,
  applyCardColor,
  parseCardColor,
} from "../src/card-color.js";

describe("card colours", () => {
  test("accepts exactly the fixed lowercase palette", () => {
    for (const color of CARD_COLORS) {
      assert.equal(parseCardColor(color), color);
    }
    assert.equal(parseCardColor("Blue"), null);
    assert.equal(parseCardColor(" blue "), null);
    assert.equal(parseCardColor("teal"), null);
    assert.equal(parseCardColor(4), null);
    assert.equal(parseCardColor(null), null);
  });

  test("sets and clears the presentation data attribute", () => {
    const window = new Window();
    const card = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as unknown as HTMLElement;

    applyCardColor(card, "purple");
    assert.equal(card.dataset.slipboxCardColor, "purple");

    applyCardColor(card, null);
    assert.equal(card.dataset.slipboxCardColor, undefined);
  });
});
