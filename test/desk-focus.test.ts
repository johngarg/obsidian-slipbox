import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import { isDeskCardFocusTarget } from "../src/desk-focus.js";

describe("Desk pile focus routing", () => {
  test("distinguishes card descendants from pile-level controls", () => {
    const window = new Window();
    const element = (tag: string) => window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      tag,
    );
    const pile = element("div");
    const handle = element("button");
    const card = element("article");
    const cardControl = element("button");
    card.className = "slipbox-tray-card";
    card.append(cardControl);
    pile.append(handle, card);

    assert.equal(isDeskCardFocusTarget(pile as unknown as Element), false);
    assert.equal(isDeskCardFocusTarget(handle as unknown as Element), false);
    assert.equal(isDeskCardFocusTarget(card as unknown as Element), true);
    assert.equal(isDeskCardFocusTarget(cardControl as unknown as Element), true);
    assert.equal(isDeskCardFocusTarget(null), false);
  });
});
