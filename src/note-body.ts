export interface NoteBodyParts {
  readonly prefix: string;
  readonly body: string;
}

export class NoteBodyConflictError extends Error {
  constructor() {
    super("The note body changed outside the inline editor");
    this.name = "NoteBodyConflictError";
  }
}

/** Split a note at the body offset supplied by Obsidian's getFrontMatterInfo(). */
export function splitNoteBody(
  source: string,
  contentStart: number,
): NoteBodyParts {
  if (
    !Number.isSafeInteger(contentStart) ||
    contentStart < 0 ||
    contentStart > source.length
  ) {
    throw new RangeError("The note body offset is outside the source text");
  }
  return {
    prefix: source.slice(0, contentStart),
    body: source.slice(contentStart),
  };
}

/** Replace only the note body while retaining every prefix byte verbatim. */
export function replaceNoteBody(
  source: string,
  contentStart: number,
  body: string,
): string {
  return splitNoteBody(source, contentStart).prefix + body;
}

/** Replace a body only when the latest source still contains the expected body. */
export function replaceNoteBodyIfUnchanged(
  source: string,
  contentStart: number,
  expectedBody: string,
  body: string,
): string {
  const latest = splitNoteBody(source, contentStart);
  if (latest.body !== expectedBody) {
    throw new NoteBodyConflictError();
  }
  return latest.prefix + body;
}
