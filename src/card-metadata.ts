import {
  cardComparatorFor,
  compareVaultPaths,
  validateAddress,
  type AddressedPath,
  type DeckOrdering,
} from "./address-order.js";

/** The metadata information needed from one Markdown file. */
export interface CardMetadataRecord {
  readonly path: string;
  readonly hasAddress: boolean;
  readonly address: unknown;
}

export function cardMetadataRecord(
  path: string,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  addressProperty: string,
): CardMetadataRecord {
  const hasAddress =
    frontmatter !== undefined &&
    Object.prototype.hasOwnProperty.call(frontmatter, addressProperty);
  return {
    path,
    hasAddress,
    address: hasAddress ? frontmatter[addressProperty] : undefined,
  };
}

export type FiledCardRecord = AddressedPath;

export interface InvalidCardIssue {
  readonly kind: "invalid";
  readonly severity: "error";
  readonly paths: readonly [string];
  readonly message: string;
}

export interface DuplicateAddressIssue {
  readonly kind: "duplicate";
  readonly severity: "warning";
  readonly address: string;
  readonly paths: readonly [string, string, ...string[]];
  readonly message: string;
}

export type CardIssue = InvalidCardIssue | DuplicateAddressIssue;

/**
 * How duplicate addresses are treated.
 *
 * Duplicates remain structurally supported under both policies: the vault can
 * always acquire them from outside Slipbox, and the Deck keeps every copy
 * selectable and adjacent in path order. The policy decides only whether they
 * are reported as a problem and whether filing may create one.
 */
export type DuplicateAddressPolicy = "allowed" | "problem";

/**
 * Explain only what an issue list can actually contain. Under the permissive
 * policy duplicates are never listed, so describing them would explain an
 * absence.
 */
export function issueListDescription(
  duplicatePolicy: DuplicateAddressPolicy,
): string {
  const duplicates = duplicatePolicy === "problem"
    ? " Duplicate-address cards remain in the Deck beside one another, ordered by file path, and filing onto an occupied address is refused."
    : "";
  return `Invalid addresses are excluded until corrected.${duplicates} Slipbox never repairs addresses automatically.`;
}

export interface IssueStatusSummary {
  readonly count: number;
  readonly severity: "warning" | "error";
  readonly description: string;
}

/**
 * Summarise outstanding issues for an ambient indicator, or null when there is
 * nothing to report. An invalid address outranks a duplicate because its card
 * is excluded from the Deck entirely, while duplicates remain usable.
 */
export function issueStatusSummary(
  issues: readonly CardIssue[],
): IssueStatusSummary | null {
  if (issues.length === 0) {
    return null;
  }
  let invalid = 0;
  let duplicate = 0;
  for (const issue of issues) {
    if (issue.kind === "invalid") {
      invalid += 1;
    } else {
      duplicate += 1;
    }
  }
  const parts: string[] = [];
  if (invalid > 0) {
    parts.push(`${invalid} unfilable card${invalid === 1 ? "" : "s"}`);
  }
  if (duplicate > 0) {
    parts.push(`${duplicate} duplicate address${duplicate === 1 ? "" : "es"}`);
  }
  return {
    count: issues.length,
    severity: invalid > 0 ? "error" : "warning",
    description: `Slipbox: ${parts.join(", ")}. Click to review.`,
  };
}

/** A complete, deterministic classification of the vault's Markdown files. */
export interface CardMetadataIndex {
  readonly filed: readonly FiledCardRecord[];
  readonly unfiledPaths: readonly string[];
  readonly issues: readonly CardIssue[];
}

export interface FiledCardLookups<T extends FiledCardRecord> {
  readonly byPath: ReadonlyMap<string, T>;
  readonly indexByPath: ReadonlyMap<string, number>;
  readonly byAddress: ReadonlyMap<string, readonly T[]>;
}

function displayValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

/** Build duplicate-safe lookup maps from a Deck-ordered filed collection. */
export function buildFiledCardLookups<T extends FiledCardRecord>(
  filed: readonly T[],
): FiledCardLookups<T> {
  const byPath = new Map<string, T>();
  const indexByPath = new Map<string, number>();
  const byAddress = new Map<string, T[]>();
  filed.forEach((card, index) => {
    byPath.set(card.path, card);
    indexByPath.set(card.path, index);
    const matches = byAddress.get(card.address) ?? [];
    matches.push(card);
    byAddress.set(card.address, matches);
  });
  return { byPath, indexByPath, byAddress };
}

/**
 * Classify cached frontmatter without depending on Obsidian.
 *
 * Missing properties are ordinary notes. Null, undefined, and the empty string
 * are unfiled cards. Valid nonempty strings are filed; duplicate addresses stay
 * adjacent and are ordered by exact vault-relative path under either policy,
 * which only decides whether they are also reported as problems.
 */
export function indexCardMetadata(
  records: Iterable<CardMetadataRecord>,
  addressProperty = "slipbox-id",
  ordering: DeckOrdering = "natural",
  duplicatePolicy: DuplicateAddressPolicy = "allowed",
): CardMetadataIndex {
  const unfiledPaths: string[] = [];
  const issues: CardIssue[] = [];
  const filed: FiledCardRecord[] = [];

  for (const record of records) {
    if (!record.hasAddress) {
      continue;
    }

    if (
      record.address === "" ||
      record.address === null ||
      record.address === undefined
    ) {
      unfiledPaths.push(record.path);
      continue;
    }

    if (typeof record.address !== "string") {
      issues.push({
        kind: "invalid",
        severity: "error",
        paths: [record.path],
        message: `Unsupported ${addressProperty} ${displayValue(record.address)}: address must be text`,
      });
      continue;
    }

    const validation = validateAddress(record.address);
    if (!validation.valid) {
      issues.push({
        kind: "invalid",
        severity: "error",
        paths: [record.path],
        message: `Unsupported ${addressProperty} ${displayValue(record.address)}: ${validation.message}`,
      });
      continue;
    }

    filed.push({ path: record.path, address: validation.address });
  }

  filed.sort(cardComparatorFor(ordering));
  unfiledPaths.sort(compareVaultPaths);

  if (duplicatePolicy === "problem") {
    const pathsByAddress = new Map<string, string[]>();
    for (const card of filed) {
      const paths = pathsByAddress.get(card.address) ?? [];
      paths.push(card.path);
      pathsByAddress.set(card.address, paths);
    }
    for (const [address, paths] of pathsByAddress) {
      const first = paths[0];
      const second = paths[1];
      if (first !== undefined && second !== undefined) {
        issues.push({
          kind: "duplicate",
          severity: "warning",
          address,
          paths: [first, second, ...paths.slice(2)],
          message: `Duplicate ${addressProperty} ${address}`,
        });
      }
    }
  }

  issues.sort((left, right) => {
    const pathComparison = compareVaultPaths(left.paths[0], right.paths[0]);
    return pathComparison !== 0
      ? pathComparison
      : compareVaultPaths(left.kind, right.kind);
  });

  return { filed, unfiledPaths, issues };
}
