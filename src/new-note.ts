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
