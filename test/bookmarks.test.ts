import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createBookmark,
  deleteBookmark,
  normalizeBookmarks,
  updateBookmark,
  type DeckBookmark,
} from "../src/bookmarks.js";

describe("bookmarks", () => {
  const first: DeckBookmark = {
    id: "bookmark-1",
    zettelId: "17/4a",
    label: "Theology",
  };

  test("creates, edits, and deletes a bookmark", () => {
    const created = createBookmark([], first);
    assert.deepEqual(created, [first]);
    const updated = updateBookmark(created, first.id, {
      label: "Magic",
    });
    assert.deepEqual(updated, [{ ...first, label: "Magic" }]);
    assert.deepEqual(deleteBookmark(updated, first.id), []);
  });

  test("enforces one bookmark per filed card", () => {
    assert.throws(
      () => createBookmark([first], {
        id: "bookmark-2",
        zettelId: first.zettelId,
      }),
      /already has a bookmark/,
    );
  });

  test("normalizes persisted state and retains stale but valid addresses", () => {
    assert.deepEqual(
      normalizeBookmarks([
        { ...first, color: "red" },
        { id: "bookmark-2", zettelId: "99/1", color: "blue" },
        { id: "duplicate-card", zettelId: "17/4a", color: "green" },
        { id: "invalid", zettelId: "01/1", color: "red" },
      ]),
      [first, { id: "bookmark-2", zettelId: "99/1", label: "" }],
    );
  });
});
