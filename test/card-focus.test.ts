import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cardFocusDeleted,
  deckCardFocus,
  deskCardFocus,
  moveDeckFocusWithAnchor,
  redirectViewedCardGhostFocus,
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
    assert.deepEqual(
      moveDeckFocusWithAnchor(viewed, "two.md", true),
      deckCardFocus("two.md"),
    );
  });

  test("redirects Deck and Desk placeholders to the viewed presentation", () => {
    assert.deepEqual(
      redirectViewedCardGhostFocus(
        deckCardFocus("viewed.md"),
        "viewed.md",
        "pile-2",
      ),
      viewedCardFocus("viewed.md", "pile-2"),
    );
    assert.deepEqual(
      redirectViewedCardGhostFocus(
        deskCardFocus("viewed.md", "pile-1"),
        "viewed.md",
        "pile-2",
      ),
      viewedCardFocus("viewed.md", "pile-2"),
    );
    const viewed = viewedCardFocus("viewed.md", "pile-2");
    assert.equal(
      redirectViewedCardGhostFocus(viewed, "viewed.md", "pile-2"),
      viewed,
    );
    const other = deckCardFocus("other.md");
    assert.equal(
      redirectViewedCardGhostFocus(other, "viewed.md", "pile-2"),
      other,
    );
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
