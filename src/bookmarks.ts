import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";

/** Current persisted bookmark identity. */
export interface DeckBookmark {
  readonly path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Load valid path bookmarks and discard every other stored shape. */
export function normalizeBookmarks(value: unknown): readonly DeckBookmark[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPaths = new Set<string>();
  const bookmarks: DeckBookmark[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.path !== "string" ||
      candidate.path === "" ||
      seenPaths.has(candidate.path)
    ) {
      continue;
    }
    seenPaths.add(candidate.path);
    bookmarks.push({ path: candidate.path });
  }
  return bookmarks;
}

export function createBookmark(
  bookmarks: readonly DeckBookmark[],
  path: string,
): readonly DeckBookmark[] {
  if (path === "") {
    throw new Error("A bookmark path is required");
  }
  if (bookmarks.some((bookmark) => bookmark.path === path)) {
    throw new Error(`${path} already has a bookmark`);
  }
  return [...bookmarks, { path }];
}

export function deleteBookmark(
  bookmarks: readonly DeckBookmark[],
  path: string,
): readonly DeckBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.path !== path);
}

export function renameBookmarkPaths(
  bookmarks: readonly DeckBookmark[],
  oldPath: string,
  newPath: string,
): readonly DeckBookmark[] {
  return normalizeBookmarks(bookmarks.map((bookmark) => {
    return { path: renamePathReference(bookmark.path, oldPath, newPath) };
  }));
}

export function removeBookmarkPaths(
  bookmarks: readonly DeckBookmark[],
  deletedPath: string,
): readonly DeckBookmark[] {
  return bookmarks.filter(
    (bookmark) => !pathIsAtOrBelow(bookmark.path, deletedPath),
  );
}
