import { compareZettelIds, isValidZettelId } from "./zettel-id.js";

/** The metadata information needed from one Markdown file. */
export interface ZettelMetadataRecord {
  readonly path: string;
  readonly hasZettelId: boolean;
  readonly zettelId: unknown;
}

export function zettelMetadataRecord(
  path: string,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  addressProperty: string,
): ZettelMetadataRecord {
  const hasZettelId =
    frontmatter !== undefined &&
    Object.prototype.hasOwnProperty.call(frontmatter, addressProperty);
  return {
    path,
    hasZettelId,
    zettelId: hasZettelId ? frontmatter[addressProperty] : undefined,
  };
}

export interface FiledZettelRecord {
  readonly path: string;
  readonly id: string;
}

export interface InvalidZettelIssue {
  readonly kind: "invalid";
  readonly severity: "error";
  readonly paths: readonly [string];
  readonly message: string;
}

export interface DuplicateZettelIssue {
  readonly kind: "duplicate";
  readonly severity: "warning";
  readonly id: string;
  readonly paths: readonly [string, string, ...string[]];
  readonly message: string;
}

export type ZettelIssue = InvalidZettelIssue | DuplicateZettelIssue;

/** A complete, deterministic classification of the vault's Markdown files. */
export interface ZettelMetadataIndex {
  readonly filed: readonly FiledZettelRecord[];
  readonly unfiledPaths: readonly string[];
  readonly issues: readonly ZettelIssue[];
  /** Every syntactically valid nonempty ID, deduplicated for collision checks. */
  readonly allValidIds: readonly string[];
}

function displayValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

/** Deterministic vault-path comparison, independent of the host locale. */
export function compareVaultPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical Deck order: address first, exact vault-relative path second. */
export function compareFiledZettels(
  left: FiledZettelRecord,
  right: FiledZettelRecord,
): number {
  const addressComparison = compareZettelIds(left.id, right.id);
  return addressComparison !== 0
    ? addressComparison
    : compareVaultPaths(left.path, right.path);
}

export interface FiledZettelLookups<T extends FiledZettelRecord> {
  readonly byPath: ReadonlyMap<string, T>;
  readonly indexByPath: ReadonlyMap<string, number>;
  readonly byAddress: ReadonlyMap<string, readonly T[]>;
}

/** Build duplicate-safe lookup maps from a Deck-ordered filed collection. */
export function buildFiledZettelLookups<T extends FiledZettelRecord>(
  filed: readonly T[],
): FiledZettelLookups<T> {
  const byPath = new Map<string, T>();
  const indexByPath = new Map<string, number>();
  const byAddress = new Map<string, T[]>();
  filed.forEach((card, index) => {
    byPath.set(card.path, card);
    indexByPath.set(card.path, index);
    const matches = byAddress.get(card.id) ?? [];
    matches.push(card);
    byAddress.set(card.id, matches);
  });
  return { byPath, indexByPath, byAddress };
}

/**
 * Classify cached frontmatter without depending on Obsidian.
 *
 * Missing properties are ordinary notes. Null, undefined, and the empty string
 * are unfiled cards. Every valid address is filed; duplicate addresses remain
 * adjacent in deterministic path order and produce a non-blocking warning.
 */
export function indexZettelMetadata(
  records: Iterable<ZettelMetadataRecord>,
  addressProperty = "zettel-id",
): ZettelMetadataIndex {
  const unfiledPaths: string[] = [];
  const issues: ZettelIssue[] = [];
  const candidates = new Map<string, string[]>();

  for (const record of records) {
    if (!record.hasZettelId) {
      continue;
    }

    if (
      record.zettelId === "" ||
      record.zettelId === null ||
      record.zettelId === undefined
    ) {
      unfiledPaths.push(record.path);
      continue;
    }

    if (
      typeof record.zettelId !== "string" ||
      !isValidZettelId(record.zettelId)
    ) {
      issues.push({
        kind: "invalid",
        severity: "error",
        paths: [record.path],
        message: `Unsupported ${addressProperty} ${displayValue(record.zettelId)}`,
      });
      continue;
    }

    const paths = candidates.get(record.zettelId) ?? [];
    paths.push(record.path);
    candidates.set(record.zettelId, paths);
  }

  const filed: FiledZettelRecord[] = [];
  const allValidIds = [...candidates.keys()].sort(compareZettelIds);

  for (const id of allValidIds) {
    const paths = candidates.get(id);
    if (paths === undefined || paths.length === 0) {
      continue;
    }

    paths.sort(compareVaultPaths);
    for (const path of paths) {
      filed.push({ path, id });
    }

    const first = paths[0];
    const second = paths[1];
    if (first !== undefined && second !== undefined) {
      issues.push({
        kind: "duplicate",
        severity: "warning",
        id,
        paths: [first, second, ...paths.slice(2)],
        message: `Duplicate ${addressProperty} ${id}`,
      });
    }
  }

  filed.sort(compareFiledZettels);
  unfiledPaths.sort(compareVaultPaths);
  issues.sort((a, b) => {
    const pathComparison = compareVaultPaths(a.paths[0], b.paths[0]);
    return pathComparison !== 0 ? pathComparison : a.kind.localeCompare(b.kind);
  });

  return {
    filed,
    unfiledPaths,
    issues,
    allValidIds,
  };
}
