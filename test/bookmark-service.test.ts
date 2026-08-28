import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BookmarkService } from "../src/bookmark-service.js";
import type { PluginDataWriteResult } from "../src/plugin-data-writer.js";

function subject(saved: PluginDataWriteResult = "saved") {
  const notices: string[] = [];
  const changes: string[][] = [];
  const service = new BookmarkService([], {
    isAvailable: (path) => path !== "Missing.md",
    label: (path) => `Card ${path}`,
    changed: (bookmarks) => changes.push(bookmarks.map((item) => item.path)),
    persist: () => Promise.resolve(saved),
    notify: (message) => notices.push(message),
  });
  return { service, notices, changes };
}

describe("BookmarkService", () => {
  test("adds, rejects duplicates, toggles, and reports successful saves", async () => {
    const { service, notices } = subject();
    await service.add("A.md");
    await service.add("A.md");
    await service.toggle("A.md");
    assert.deepEqual(service.items, []);
    assert.deepEqual(notices, [
      "Bookmarked Card A.md.",
      "Card A.md already has a bookmark.",
      "Deleted bookmark at Card A.md.",
    ]);
  });

  test("keeps a failed in-memory change without showing success", async () => {
    const { service, notices } = subject("failed");
    await service.add("A.md");
    assert.equal(service.at("A.md")?.path, "A.md");
    assert.deepEqual(notices, []);
  });

  test("reconciles folder renames and deletions", async () => {
    const { service } = subject();
    await service.add("Folder/A.md");
    await service.handlePathRename("Folder", "Archive");
    assert.equal(service.items[0]?.path, "Archive/A.md");
    await service.handlePathDeletion("Archive");
    assert.deepEqual(service.items, []);
  });
});
