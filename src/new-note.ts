const UNSAFE_FILENAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Convert a title or formatted timestamp into a portable Markdown basename. */
export function safeNoteBasename(value: string): string | null {
  const trimmed = value.trim();
  const safeContent = trimmed
    .replace(UNSAFE_FILENAME_CHARACTERS, "")
    .replace(/[. ]+$/g, "")
    .trim();
  if (safeContent === "") {
    return null;
  }
  const basename = trimmed
    .replace(UNSAFE_FILENAME_CHARACTERS, "-")
    .replace(/-+/g, "-")
    .replace(/[. ]+$/g, "")
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
