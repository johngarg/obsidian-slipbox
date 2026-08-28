import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createBookmark,
  deleteBookmark,
  normalizeBookmarks,
  removeBookmarkPaths,
  renameBookmarkPaths,
  type DeckBookmark,
} from "../src/bookmarks.js";

describe("bookmarks", () => {
  const first: DeckBookmark = { path: "Cards/first.md" };

  test("creates and deletes an exact-path bookmark", () => {
    const created = createBookmark([], first.path);
    assert.deepEqual(created, [first]);
    assert.deepEqual(deleteBookmark(created, first.path), []);
  });

  test("bookmarks duplicate-address cards independently", () => {
    const firstDuplicate = createBookmark([], "Cards/a.md");
    const both = createBookmark(firstDuplicate, "Cards/b.md");
    assert.deepEqual(both, [
      { path: "Cards/a.md" },
      { path: "Cards/b.md" },
    ]);
    assert.deepEqual(deleteBookmark(both, "Cards/a.md"), [
      { path: "Cards/b.md" },
    ]);
  });

  test("enforces one bookmark per exact file", () => {
    assert.throws(
      () => createBookmark([first], first.path),
      /already has a bookmark/,
    );
  });

  test("loads unique path records and drops every other shape", () => {
    assert.deepEqual(
      normalizeBookmarks([
        first,
        { path: "Cards/second.md", label: "Old label" },
        { path: "Cards/first.md" },
        { zettelId: "17/4a", color: "red" },
        { zettelId: "17/4a" },
        { zettelId: " 01/1" },
      ]),
      [first, { path: "Cards/second.md" }],
    );
  });

  test("updates file and folder renames and deletes only affected paths", () => {
    const bookmarks = [
      { path: "Cards/a.md" },
      { path: "Cards/Nested/b.md" },
      { path: "Other/c.md" },
    ];
    assert.deepEqual(
      renameBookmarkPaths(bookmarks, "Cards", "Archive/Cards"),
      [
        { path: "Archive/Cards/a.md" },
        { path: "Archive/Cards/Nested/b.md" },
        { path: "Other/c.md" },
      ],
    );
    assert.deepEqual(removeBookmarkPaths(bookmarks, "Cards/a.md"), [
      { path: "Cards/Nested/b.md" },
      { path: "Other/c.md" },
    ]);
    assert.deepEqual(removeBookmarkPaths(bookmarks, "Cards"), [
      { path: "Other/c.md" },
    ]);
  });
});
