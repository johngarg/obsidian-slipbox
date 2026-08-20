import { isValidZettelId } from "./zettel-id.js";

export const BOOKMARK_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

export type BookmarkColor = (typeof BOOKMARK_COLORS)[number];

export interface DeckBookmark {
  readonly id: string;
  readonly zettelId: string;
  readonly label: string;
  readonly color: BookmarkColor;
}

export interface BookmarkInput {
  readonly id: string;
  readonly zettelId: string;
  readonly label?: string;
  readonly color: BookmarkColor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isBookmarkColor(value: unknown): value is BookmarkColor {
  return BOOKMARK_COLORS.some((color) => color === value);
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
      !isValidZettelId(candidate.zettelId) ||
      !isBookmarkColor(candidate.color)
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
      color: candidate.color,
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
      color: input.color,
    },
  ];
}

export function updateBookmark(
  bookmarks: readonly DeckBookmark[],
  id: string,
  update: Readonly<{ label: string; color: BookmarkColor }>,
): readonly DeckBookmark[] {
  return bookmarks.map((bookmark) =>
    bookmark.id === id
      ? { ...bookmark, label: update.label.trim().slice(0, 80), color: update.color }
      : bookmark,
  );
}

export function deleteBookmark(
  bookmarks: readonly DeckBookmark[],
  id: string,
): readonly DeckBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.id !== id);
}
