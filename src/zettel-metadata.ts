import { compareZettelIds, isValidZettelId } from "./zettel-id.js";

/** The metadata information needed from one Markdown file. */
export interface ZettelMetadataRecord {
  readonly path: string;
  readonly hasZettelId: boolean;
  readonly zettelId: unknown;
}

export interface FiledZettelRecord {
  readonly path: string;
  readonly id: string;
}

export interface InvalidZettelIssue {
  readonly kind: "invalid";
  readonly paths: readonly [string];
  readonly message: string;
}

export interface DuplicateZettelIssue {
  readonly kind: "duplicate";
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

/**
 * Classify cached frontmatter without depending on Obsidian.
 *
 * Missing properties are ordinary notes. Null, undefined, and the empty string
 * are unfiled cards. Duplicate IDs are all withheld from the Deck: choosing one
 * file would silently invent an ordering tie-breaker and conceal the problem.
 */
export function indexZettelMetadata(
  records: Iterable<ZettelMetadataRecord>,
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
        paths: [record.path],
        message: `Unsupported zettel-id ${displayValue(record.zettelId)}`,
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

    paths.sort((a, b) => a.localeCompare(b));
    if (paths.length === 1) {
      const path = paths[0];
      if (path !== undefined) {
        filed.push({ path, id });
      }
      continue;
    }

    const first = paths[0];
    const second = paths[1];
    if (first !== undefined && second !== undefined) {
      issues.push({
        kind: "duplicate",
        id,
        paths: [first, second, ...paths.slice(2)],
        message: `Duplicate zettel-id ${id}`,
      });
    }
  }

  filed.sort((a, b) => compareZettelIds(a.id, b.id));
  unfiledPaths.sort((a, b) => a.localeCompare(b));
  issues.sort((a, b) => {
    const pathComparison = a.paths[0].localeCompare(b.paths[0]);
    return pathComparison !== 0 ? pathComparison : a.kind.localeCompare(b.kind);
  });

  return {
    filed,
    unfiledPaths,
    issues,
    allValidIds,
  };
}
