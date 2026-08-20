import { isValidZettelId } from "./zettel-id.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";

/** Current persisted bookmark identity. */
export interface DeckBookmark {
  readonly path: string;
}

/** Address-only bookmark retained just long enough for schema migration. */
export interface LegacyAddressBookmark {
  readonly zettelId: string;
}

export type StoredBookmark = DeckBookmark | LegacyAddressBookmark;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPathBookmark(
  bookmark: StoredBookmark,
): bookmark is DeckBookmark {
  return "path" in bookmark;
}

/** Load both current path bookmarks and legacy address bookmarks tolerantly. */
export function normalizeBookmarks(value: unknown): readonly StoredBookmark[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPaths = new Set<string>();
  const seenLegacyIds = new Set<string>();
  const bookmarks: StoredBookmark[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    if (typeof candidate.path === "string" && candidate.path !== "") {
      if (!seenPaths.has(candidate.path)) {
        seenPaths.add(candidate.path);
        bookmarks.push({ path: candidate.path });
      }
      continue;
    }
    if (
      typeof candidate.zettelId === "string" &&
      isValidZettelId(candidate.zettelId) &&
      !seenLegacyIds.has(candidate.zettelId)
    ) {
      seenLegacyIds.add(candidate.zettelId);
      bookmarks.push({ zettelId: candidate.zettelId });
    }
  }
  return bookmarks;
}

/** Resolve old address bookmarks to the first path-sorted card at that address. */
export function migrateAddressBookmarks(
  bookmarks: readonly StoredBookmark[],
  firstPathAtAddress: (zettelId: string) => string | undefined,
): readonly DeckBookmark[] {
  const seenPaths = new Set<string>();
  const migrated: DeckBookmark[] = [];
  for (const bookmark of bookmarks) {
    const path = isPathBookmark(bookmark)
      ? bookmark.path
      : firstPathAtAddress(bookmark.zettelId);
    if (path === undefined || path === "" || seenPaths.has(path)) {
      continue;
    }
    seenPaths.add(path);
    migrated.push({ path });
  }
  return migrated;
}

export function createBookmark(
  bookmarks: readonly StoredBookmark[],
  path: string,
): readonly StoredBookmark[] {
  if (path === "") {
    throw new Error("A bookmark path is required");
  }
  if (bookmarks.some(
    (bookmark) => isPathBookmark(bookmark) && bookmark.path === path,
  )) {
    throw new Error(`${path} already has a bookmark`);
  }
  return [...bookmarks, { path }];
}

export function deleteBookmark(
  bookmarks: readonly StoredBookmark[],
  path: string,
): readonly StoredBookmark[] {
  return bookmarks.filter(
    (bookmark) => !isPathBookmark(bookmark) || bookmark.path !== path,
  );
}

export function renameBookmarkPaths(
  bookmarks: readonly StoredBookmark[],
  oldPath: string,
  newPath: string,
): readonly StoredBookmark[] {
  return normalizeBookmarks(bookmarks.map((bookmark) => {
    if (!isPathBookmark(bookmark)) {
      return bookmark;
    }
    return { path: renamePathReference(bookmark.path, oldPath, newPath) };
  }));
}

export function removeBookmarkPaths(
  bookmarks: readonly StoredBookmark[],
  deletedPath: string,
): readonly StoredBookmark[] {
  return bookmarks.filter(
    (bookmark) =>
      !isPathBookmark(bookmark) ||
      !pathIsAtOrBelow(bookmark.path, deletedPath),
  );
}
