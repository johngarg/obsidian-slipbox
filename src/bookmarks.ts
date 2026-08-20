import { isValidZettelId } from "./zettel-id.js";

export interface DeckBookmark {
  readonly zettelId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Load bookmark state tolerantly while enforcing one bookmark per card. */
export function normalizeBookmarks(value: unknown): readonly DeckBookmark[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenZettelIds = new Set<string>();
  const bookmarks: DeckBookmark[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.zettelId !== "string" ||
      !isValidZettelId(candidate.zettelId)
    ) {
      continue;
    }
    if (seenZettelIds.has(candidate.zettelId)) {
      continue;
    }
    seenZettelIds.add(candidate.zettelId);
    bookmarks.push({ zettelId: candidate.zettelId });
  }
  return bookmarks;
}

export function createBookmark(
  bookmarks: readonly DeckBookmark[],
  zettelId: string,
): readonly DeckBookmark[] {
  if (bookmarks.some((bookmark) => bookmark.zettelId === zettelId)) {
    throw new Error(`${zettelId} already has a bookmark`);
  }
  if (!isValidZettelId(zettelId)) {
    throw new Error(`${zettelId} is not a valid Zettel address`);
  }
  return [...bookmarks, { zettelId }];
}

export function deleteBookmark(
  bookmarks: readonly DeckBookmark[],
  zettelId: string,
): readonly DeckBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.zettelId !== zettelId);
}
