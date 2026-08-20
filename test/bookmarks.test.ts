import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createBookmark,
  deleteBookmark,
  normalizeBookmarks,
  type DeckBookmark,
} from "../src/bookmarks.js";

describe("bookmarks", () => {
  const first: DeckBookmark = {
    zettelId: "17/4a",
  };

  test("creates and deletes a zettel-id bookmark", () => {
    const created = createBookmark([], first.zettelId);
    assert.deepEqual(created, [first]);
    assert.deepEqual(deleteBookmark(created, first.zettelId), []);
  });

  test("enforces one bookmark per filed card", () => {
    assert.throws(
      () => createBookmark([first], first.zettelId),
      /already has a bookmark/,
    );
  });

  test("drops legacy names and identifiers while retaining valid addresses", () => {
    assert.deepEqual(
      normalizeBookmarks([
        { id: "bookmark-1", ...first, label: "Theology", color: "red" },
        { id: "bookmark-2", zettelId: "99/1", color: "blue" },
        { id: "duplicate-card", zettelId: "17/4a", color: "green" },
        { id: "invalid", zettelId: "01/1", color: "red" },
      ]),
      [first, { zettelId: "99/1" }],
    );
  });
});
