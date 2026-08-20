/** A numeric component in a canonical Slipbox path. */
export interface NumericToken {
  readonly type: "number";
  readonly value: number;
}

/** An alphabetic component in a canonical Slipbox path. */
export interface AlphaToken {
  readonly type: "alpha";
  readonly value: string;
}

export type PathToken = NumericToken | AlphaToken;

/** A parsed canonical Slipbox address. */
export interface ParsedZettelId {
  readonly section: number;
  readonly path: readonly [NumericToken, ...PathToken[]];
}

/** The common failure type for malformed addresses and invalid filing requests. */
export class ZettelIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZettelIdError";
  }
}

// This single expression defines the v0.1 string grammar. Tokenization happens
// only after the complete address has passed this check.
const ZETTEL_ID_PATTERN =
  /^([1-9]\d*)\/([1-9]\d*(?:[a-z]+[1-9]\d*)*[a-z]*)$/;
const PATH_TOKEN_PATTERN = /[1-9]\d*|[a-z]+/g;
const ALPHA_TOKEN_PATTERN = /^[a-z]+$/;

function parsePositiveInteger(value: string, context: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ZettelIdError(
      `${context} must be a positive integer no greater than Number.MAX_SAFE_INTEGER`,
    );
  }
  return parsed;
}

function assertPositiveInteger(value: number, context: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ZettelIdError(
      `${context} must be a positive integer no greater than Number.MAX_SAFE_INTEGER`,
    );
  }
}

function assertAlphaToken(value: string): void {
  if (!ALPHA_TOKEN_PATTERN.test(value)) {
    throw new ZettelIdError(
      `Alphabetic token must contain only lowercase ASCII letters: ${JSON.stringify(value)}`,
    );
  }
}

function numericToken(value: number): NumericToken {
  assertPositiveInteger(value, "Numeric token");
  return Object.freeze({ type: "number", value });
}

function alphaToken(value: string): AlphaToken {
  assertAlphaToken(value);
  return Object.freeze({ type: "alpha", value });
}

/** Parse a canonical v0.1 Slipbox address. */
export function parseZettelId(id: string): ParsedZettelId {
  const match = ZETTEL_ID_PATTERN.exec(id);
  if (match === null) {
    throw new ZettelIdError(`Invalid Slipbox address: ${JSON.stringify(id)}`);
  }

  const sectionText = match[1];
  const pathText = match[2];
  if (sectionText === undefined || pathText === undefined) {
    throw new ZettelIdError(`Invalid Slipbox address: ${JSON.stringify(id)}`);
  }

  const section = parsePositiveInteger(sectionText, "Section");
  const tokenTexts = pathText.match(PATH_TOKEN_PATTERN);
  if (tokenTexts === null || tokenTexts.length === 0) {
    throw new ZettelIdError(`Invalid Slipbox path: ${JSON.stringify(pathText)}`);
  }

  const path = tokenTexts.map((tokenText, index): PathToken => {
    if (index % 2 === 0) {
      return numericToken(parsePositiveInteger(tokenText, "Numeric token"));
    }
    return alphaToken(tokenText);
  });

  return Object.freeze({
    section,
    path: Object.freeze(path) as unknown as readonly [
      NumericToken,
      ...PathToken[],
    ],
  });
}

/** Return whether a string is a canonical v0.1 Slipbox address. */
export function isValidZettelId(id: string): boolean {
  try {
    parseZettelId(id);
    return true;
  } catch (error) {
    if (error instanceof ZettelIdError) {
      return false;
    }
    throw error;
  }
}

/** Serialize a parsed address, validating its runtime shape and alternation. */
export function formatZettelId(id: ParsedZettelId): string {
  assertPositiveInteger(id.section, "Section");
  if (id.path.length === 0) {
    throw new ZettelIdError("A Slipbox path must contain at least one token");
  }

  const formattedPath = id.path.map((token, index): string => {
    const expectedType = index % 2 === 0 ? "number" : "alpha";
    if (token.type !== expectedType) {
      throw new ZettelIdError(
        `Path token ${index} must be ${expectedType}, received ${token.type}`,
      );
    }

    if (token.type === "number") {
      assertPositiveInteger(token.value, `Numeric token ${index}`);
      return String(token.value);
    }

    assertAlphaToken(token.value);
    return token.value;
  });

  return `${id.section}/${formattedPath.join("")}`;
}

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compare alphabetic tokens in Excel-column order.
 *
 * Every shorter lowercase token precedes every longer token, and equal-length
 * tokens use ASCII lexical order. This is equivalent to interpreting a..z as
 * the digits 1..26, without converting to a bounded JavaScript number.
 */
function compareAlphaTokens(a: string, b: string): number {
  if (a.length !== b.length) {
    return compareNumbers(a.length, b.length);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare two canonical addresses in physical filing order. */
export function compareZettelIds(a: string, b: string): number {
  const parsedA = parseZettelId(a);
  const parsedB = parseZettelId(b);

  const sectionComparison = compareNumbers(parsedA.section, parsedB.section);
  if (sectionComparison !== 0) {
    return sectionComparison;
  }

  const sharedLength = Math.min(parsedA.path.length, parsedB.path.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const tokenA = parsedA.path[index];
    const tokenB = parsedB.path[index];
    if (tokenA === undefined || tokenB === undefined) {
      throw new ZettelIdError("Unexpected missing path token");
    }

    let comparison: number;
    if (tokenA.type === "number" && tokenB.type === "number") {
      comparison = compareNumbers(tokenA.value, tokenB.value);
    } else if (tokenA.type === "alpha" && tokenB.type === "alpha") {
      comparison = compareAlphaTokens(tokenA.value, tokenB.value);
    } else {
      throw new ZettelIdError("Canonical paths have incompatible token types");
    }

    if (comparison !== 0) {
      return comparison;
    }
  }

  // A parent is filed immediately before every descendant for which it is a
  // complete token prefix.
  return compareNumbers(parsedA.path.length, parsedB.path.length);
}

/** Increment a lowercase alphabetic token in a..z, aa..az, ba... order. */
export function incrementAlphaToken(value: string): string {
  assertAlphaToken(value);

  const characters = [...value];
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index];
    if (character === undefined) {
      throw new ZettelIdError("Unexpected missing alphabetic character");
    }

    if (character !== "z") {
      characters[index] = String.fromCharCode(character.charCodeAt(0) + 1);
      return characters.join("");
    }
    characters[index] = "a";
  }

  return `a${characters.join("")}`;
}

function incrementNumericValue(value: number): number {
  assertPositiveInteger(value, "Numeric token");
  if (value === Number.MAX_SAFE_INTEGER) {
    throw new ZettelIdError("Numeric token cannot be incremented safely");
  }
  return value + 1;
}

function withPath(
  section: number,
  path: readonly [NumericToken, ...PathToken[]],
): string {
  return formatZettelId({ section, path });
}

function nextSibling(id: ParsedZettelId): string {
  const path = [...id.path];
  const lastToken = path[path.length - 1];
  if (lastToken === undefined) {
    throw new ZettelIdError("A Slipbox path must not be empty");
  }

  path[path.length - 1] =
    lastToken.type === "number"
      ? numericToken(incrementNumericValue(lastToken.value))
      : alphaToken(incrementAlphaToken(lastToken.value));

  return withPath(id.section, path as [NumericToken, ...PathToken[]]);
}

function firstAvailableChild(
  attachment: ParsedZettelId,
  existingIds: ReadonlySet<string>,
): string {
  const lastToken = attachment.path[attachment.path.length - 1];
  if (lastToken === undefined) {
    throw new ZettelIdError("A Slipbox path must not be empty");
  }

  if (lastToken.type === "number") {
    let candidateValue = "a";
    while (true) {
      const candidate = withPath(attachment.section, [
        ...attachment.path,
        alphaToken(candidateValue),
      ]);
      if (!existingIds.has(candidate)) {
        return candidate;
      }
      candidateValue = incrementAlphaToken(candidateValue);
    }
  }

  let candidateValue = 1;
  while (true) {
    const candidate = withPath(attachment.section, [
      ...attachment.path,
      numericToken(candidateValue),
    ]);
    if (!existingIds.has(candidate)) {
      return candidate;
    }
    candidateValue = incrementNumericValue(candidateValue);
  }
}

function normalizeExistingIds(existingIds: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const id of existingIds) {
    // Parsing here makes malformed data a domain error instead of allowing it
    // to be silently ignored during address generation.
    normalized.add(formatZettelId(parseZettelId(id)));
  }
  return normalized;
}

/**
 * Generate the address for a new card filed from an existing attachment.
 *
 * The next sibling is preferred. If occupied, the first gap in the direct
 * child sequence is used; number-ending paths have letter children and
 * letter-ending paths have number children.
 */
export function generateFiledId(
  attachmentId: string,
  existingIds: Iterable<string>,
): string {
  const attachment = parseZettelId(attachmentId);
  const normalizedExistingIds = normalizeExistingIds(existingIds);

  if (!normalizedExistingIds.has(attachmentId)) {
    throw new ZettelIdError(
      `Attachment address is absent from existing IDs: ${attachmentId}`,
    );
  }

  const sibling = nextSibling(attachment);
  if (!normalizedExistingIds.has(sibling)) {
    return sibling;
  }

  return firstAvailableChild(attachment, normalizedExistingIds);
}

/** Generate the first card in the section after the highest existing section. */
export function generateNextSectionId(existingIds: Iterable<string>): string {
  const normalizedExistingIds = normalizeExistingIds(existingIds);
  let highestSection = 0;

  for (const id of normalizedExistingIds) {
    highestSection = Math.max(highestSection, parseZettelId(id).section);
  }

  if (highestSection === Number.MAX_SAFE_INTEGER) {
    throw new ZettelIdError("Section cannot be incremented safely");
  }

  return `${highestSection + 1}/1`;
}
