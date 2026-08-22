import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cardFocusDeleted,
  deckCardFocus,
  deskCardFocus,
  moveDeckFocusWithAnchor,
  renameCardFocus,
  viewedCardFocus,
} from "../src/card-focus.js";

describe("single card focus", () => {
  test("moves Deck focus with the anchor but preserves Desk and viewed focus", () => {
    assert.deepEqual(
      moveDeckFocusWithAnchor(deckCardFocus("one.md"), "two.md"),
      deckCardFocus("two.md"),
    );
    const desk = deskCardFocus("desk.md", "pile-1");
    const viewed = viewedCardFocus("viewed.md", "pile-2");
    assert.equal(moveDeckFocusWithAnchor(desk, "two.md"), desk);
    assert.equal(moveDeckFocusWithAnchor(viewed, "two.md"), viewed);
    assert.equal(moveDeckFocusWithAnchor(null, "two.md"), null);
  });

  test("keeps presentation identity while renaming exact paths and folders", () => {
    assert.deepEqual(
      renameCardFocus(deskCardFocus("Old/card.md", "pile-1"), "Old", "New"),
      deskCardFocus("New/card.md", "pile-1"),
    );
    assert.deepEqual(
      renameCardFocus(viewedCardFocus("one.md"), "one.md", "two.md"),
      viewedCardFocus("two.md"),
    );
  });

  test("detects exact and descendant deletion without touching siblings", () => {
    const focus = deskCardFocus("Cards/one.md", "pile-1");
    assert.equal(cardFocusDeleted(focus, "Cards"), true);
    assert.equal(cardFocusDeleted(focus, "Cards/one.md"), true);
    assert.equal(cardFocusDeleted(focus, "Cards/two.md"), false);
    assert.equal(cardFocusDeleted(null, "Cards"), false);
  });
});
