import { isValidZettelId } from "./zettel-id.js";

export interface DeckBookmark {
  readonly id: string;
  readonly zettelId: string;
  readonly label: string;
}

export interface BookmarkInput {
  readonly id: string;
  readonly zettelId: string;
  readonly label?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Load bookmark state tolerantly while enforcing one bookmark per card. */
export function normalizeBookmarks(value: unknown): readonly DeckBookmark[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  const seenZettelIds = new Set<string>();
  const bookmarks: DeckBookmark[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      candidate.id.trim() === "" ||
      typeof candidate.zettelId !== "string" ||
      !isValidZettelId(candidate.zettelId)
    ) {
      continue;
    }
    const id = candidate.id.trim();
    if (seenIds.has(id) || seenZettelIds.has(candidate.zettelId)) {
      continue;
    }
    seenIds.add(id);
    seenZettelIds.add(candidate.zettelId);
    bookmarks.push({
      id,
      zettelId: candidate.zettelId,
      label: typeof candidate.label === "string"
        ? candidate.label.trim().slice(0, 80)
        : "",
    });
  }
  return bookmarks;
}

export function createBookmark(
  bookmarks: readonly DeckBookmark[],
  input: BookmarkInput,
): readonly DeckBookmark[] {
  if (bookmarks.some((bookmark) => bookmark.zettelId === input.zettelId)) {
    throw new Error(`${input.zettelId} already has a bookmark`);
  }
  if (bookmarks.some((bookmark) => bookmark.id === input.id)) {
    throw new Error(`Bookmark identifier ${input.id} is already in use`);
  }
  if (!isValidZettelId(input.zettelId)) {
    throw new Error(`${input.zettelId} is not a valid Zettel address`);
  }
  return [
    ...bookmarks,
    {
      id: input.id,
      zettelId: input.zettelId,
      label: input.label?.trim().slice(0, 80) ?? "",
    },
  ];
}

export function updateBookmark(
  bookmarks: readonly DeckBookmark[],
  id: string,
  update: Readonly<{ label: string }>,
): readonly DeckBookmark[] {
  return bookmarks.map((bookmark) =>
    bookmark.id === id
      ? { ...bookmark, label: update.label.trim().slice(0, 80) }
      : bookmark,
  );
}

export function deleteBookmark(
  bookmarks: readonly DeckBookmark[],
  id: string,
): readonly DeckBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.id !== id);
}
