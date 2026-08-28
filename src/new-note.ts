import type { CardColor } from "./card-color.js";

const UNSAFE_FILENAME_CHARACTERS = new Set('\\/:*?"<>|');

export type NewCardCreationMode = "quick" | "options";

export interface NewCardInput {
  readonly title: string;
  readonly color: CardColor | null;
}

/**
 * Resolve all user input for a creation command. The ordinary New card path
 * remains prompt-free, while New card with options delegates to one combined
 * title-and-colour dialog.
 */
export async function resolveNewCardInput(
  mode: NewCardCreationMode,
  prompt: () => Promise<NewCardInput | null>,
): Promise<NewCardInput | null> {
  return mode === "quick" ? { title: "", color: null } : prompt();
}

function replaceUnsafeFilenameCharacters(
  value: string,
  replacement: string,
): string {
  let result = "";
  for (const character of value) {
    result += (
      character.charCodeAt(0) <= 0x1f ||
      UNSAFE_FILENAME_CHARACTERS.has(character)
    )
      ? replacement
      : character;
  }
  return result;
}

/** Convert a title or formatted timestamp into a portable Markdown basename. */
export function safeNoteBasename(value: string): string | null {
  const trimmed = value.trim();
  const safeContent = replaceUnsafeFilenameCharacters(trimmed, "")
    .replace(/[. ]+$/, "")
    .trim();
  if (safeContent === "") {
    return null;
  }
  const basename = replaceUnsafeFilenameCharacters(trimmed, "-")
    .replace(/-+/g, "-")
    .replace(/[. ]+$/, "")
    .trim();
  return basename === "" ? null : basename;
}

/** Prefer the supplied title and fall back to the already-formatted timestamp. */
export function newNoteBasename(title: string, timestamp: string): string {
  return safeNoteBasename(title) ?? safeNoteBasename(timestamp) ?? "Untitled";
}

/** Apply the configured title source to a newly created card's filename. */
export function newCardBasename(
  title: string,
  timestamp: string,
  titleSource: "filename" | "frontmatter",
): string {
  return newNoteBasename(titleSource === "filename" ? title : "", timestamp);
}

/** Return the title property value only when frontmatter supplies card titles. */
export function newCardFrontmatterTitle(
  title: string,
  titleSource: "filename" | "frontmatter",
): string | null {
  return titleSource === "frontmatter" ? title.trim() : null;
}

/** Describe what leaving the new-card title prompt blank will do. */
export function newCardTitlePlaceholder(
  timestamp: string,
  titleSource: "filename" | "frontmatter",
): string {
  return titleSource === "frontmatter"
    ? "Leave blank for an empty title"
    : `Leave blank to use ${timestamp} as the filename`;
}
