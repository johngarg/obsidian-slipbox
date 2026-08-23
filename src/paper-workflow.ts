export interface RestrictedPasteResult {
  readonly text: string;
  readonly truncated: boolean;
}

export interface TextReplacement {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly replacement: string;
}

/** Compare editor text independently of textarea newline normalization. */
export function normalizeEditorLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** Existing text is protected when it remains an ordered code-point subsequence. */
export function preservesProtectedText(
  protectedBody: string | null,
  draft: string,
): boolean {
  if (protectedBody === null) {
    return true;
  }
  const protectedPoints = Array.from(normalizeEditorLineEndings(protectedBody));
  if (protectedPoints.length === 0) {
    return true;
  }
  let protectedIndex = 0;
  for (const point of Array.from(normalizeEditorLineEndings(draft))) {
    if (point === protectedPoints[protectedIndex]) {
      protectedIndex += 1;
      if (protectedIndex === protectedPoints.length) {
        return true;
      }
    }
  }
  return false;
}

/** Apply one textarea replacement using its UTF-16 selection offsets. */
export function applyTextReplacement(options: TextReplacement): string {
  return options.value.slice(0, options.selectionStart) +
    options.replacement +
    options.value.slice(options.selectionEnd);
}

/**
 * Predict the common cancellable textarea mutations exposed by beforeinput.
 * A null result means the browser operation must be checked after input.
 */
export function beforeInputCandidate(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  inputType: string,
  data: string | null,
): string | null {
  if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
    return applyTextReplacement({
      value,
      selectionStart,
      selectionEnd,
      replacement: "\n",
    });
  }
  if (inputType.startsWith("insert") && data !== null) {
    return applyTextReplacement({
      value,
      selectionStart,
      selectionEnd,
      replacement: data,
    });
  }
  if (!inputType.startsWith("delete")) {
    return null;
  }
  if (selectionStart !== selectionEnd) {
    return applyTextReplacement({
      value,
      selectionStart,
      selectionEnd,
      replacement: "",
    });
  }
  if (inputType === "deleteContentBackward") {
    const start = previousCodePointStart(value, selectionStart);
    return applyTextReplacement({
      value,
      selectionStart: start,
      selectionEnd,
      replacement: "",
    });
  }
  if (inputType === "deleteContentForward") {
    const end = nextCodePointEnd(value, selectionEnd);
    return applyTextReplacement({
      value,
      selectionStart,
      selectionEnd: end,
      replacement: "",
    });
  }
  return null;
}

/** Restrict a clipboard payload to one word unless it is one complete link. */
export function restrictViewedCardPaste(value: string): RestrictedPasteResult {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { text: "", truncated: false };
  }
  if (!/\s/u.test(trimmed) || isStandaloneCardLink(trimmed)) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: /^\S+/u.exec(trimmed)?.[0] ?? "",
    truncated: true,
  };
}

/** Supported multi-word Wiki and Markdown link/embed syntax. */
export function isStandaloneCardLink(value: string): boolean {
  if (value === "" || /[\r\n]/u.test(value)) {
    return false;
  }
  if (isStandaloneWikiLink(value)) {
    return true;
  }
  const firstBracket = value.startsWith("!") ? 1 : 0;
  if (value[firstBracket] !== "[") {
    return false;
  }
  const labelEnd = balancedEnd(value, firstBracket, "[", "]");
  if (labelEnd === null || labelEnd >= value.length) {
    return false;
  }
  const suffixStart = labelEnd;
  if (value[suffixStart] === "(") {
    const suffixEnd = balancedEnd(value, suffixStart, "(", ")");
    return suffixEnd === value.length &&
      isValidInlineLinkSuffix(value.slice(suffixStart + 1, -1));
  }
  if (value[suffixStart] === "[") {
    const suffixEnd = balancedEnd(value, suffixStart, "[", "]");
    if (suffixEnd !== value.length) {
      return false;
    }
    const reference = value.slice(suffixStart + 1, -1);
    return reference === "" || reference.trim() !== "";
  }
  return false;
}

function isStandaloneWikiLink(value: string): boolean {
  const start = value.startsWith("![[") ? 1 : value.startsWith("[[") ? 0 : -1;
  if (start < 0 || !value.endsWith("]]")) {
    return false;
  }
  const inner = value.slice(start + 2, -2);
  return inner.trim() !== "" && !inner.includes("[[") && !inner.includes("]]");
}

/** Validate a Markdown destination followed by at most one optional title. */
function isValidInlineLinkSuffix(value: string): boolean {
  if (/[\r\n]/u.test(value)) {
    return false;
  }
  let index = skipWhitespace(value, 0);
  if (index === value.length) {
    return true;
  }

  if (value[index] === "<") {
    index = angleDestinationEnd(value, index);
    if (index < 0) {
      return false;
    }
  } else {
    index = bareDestinationEnd(value, index);
    if (index < 0) {
      return false;
    }
  }

  const titleStart = skipWhitespace(value, index);
  if (titleStart === value.length) {
    return true;
  }
  if (titleStart === index) {
    return false;
  }
  return markdownTitleEnd(value, titleStart) === value.length;
}

function angleDestinationEnd(value: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "<") {
      return -1;
    }
    if (character === ">") {
      return index + 1;
    }
  }
  return -1;
}

function bareDestinationEnd(value: string, start: number): number {
  let depth = 0;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value.charAt(index);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (/\s/u.test(character)) {
      return index;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth === 0) {
        return -1;
      }
      depth -= 1;
    }
  }
  return depth === 0 ? value.length : -1;
}

function markdownTitleEnd(value: string, start: number): number {
  const open = value.charAt(start);
  const close = open === "(" ? ")" : open;
  if (open !== '"' && open !== "'" && open !== "(") {
    return -1;
  }
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === close) {
      return skipWhitespace(value, index + 1);
    }
  }
  return -1;
}

function skipWhitespace(value: string, start: number): number {
  let index = start;
  while (index < value.length && /\s/u.test(value.charAt(index))) {
    index += 1;
  }
  return index;
}

/** Return the exclusive end of one balanced construct, respecting escapes. */
function balancedEnd(
  value: string,
  start: number,
  open: string,
  close: string,
): number | null {
  if (value[start] !== open) {
    return null;
  }
  let depth = 0;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return null;
}

function previousCodePointStart(value: string, offset: number): number {
  if (offset <= 0) {
    return 0;
  }
  const final = value.charCodeAt(offset - 1);
  if (
    final >= 0xdc00 && final <= 0xdfff &&
    offset >= 2
  ) {
    const first = value.charCodeAt(offset - 2);
    if (first >= 0xd800 && first <= 0xdbff) {
      return offset - 2;
    }
  }
  return offset - 1;
}

function nextCodePointEnd(value: string, offset: number): number {
  if (offset >= value.length) {
    return value.length;
  }
  const first = value.charCodeAt(offset);
  if (
    first >= 0xd800 && first <= 0xdbff &&
    offset + 1 < value.length
  ) {
    const final = value.charCodeAt(offset + 1);
    if (final >= 0xdc00 && final <= 0xdfff) {
      return offset + 2;
    }
  }
  return offset + 1;
}
