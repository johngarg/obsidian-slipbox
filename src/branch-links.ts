export interface BranchLinkReference {
  readonly link: string;
  readonly original: string;
  readonly displayText?: string;
}

export const EXPLICIT_BRANCH_MARKER = "+";

export interface ExplicitBranchSource {
  readonly path: string;
  readonly address: string;
  readonly deckIndex: number;
  readonly links: readonly BranchLinkReference[];
}

export interface ExplicitBranch {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly label: string;
  readonly sourceOrder: number;
}

export interface ExplicitBranchIndex {
  readonly outgoingBySourcePath: ReadonlyMap<string, readonly ExplicitBranch[]>;
  readonly incomingByTargetPath: ReadonlyMap<string, readonly ExplicitBranch[]>;
}

export interface ExplicitBranchIndexOptions {
  readonly enabled: boolean;
  readonly resolveTargetPath: (
    link: string,
    sourcePath: string,
  ) => string | undefined;
}

export const EMPTY_EXPLICIT_BRANCH_INDEX: ExplicitBranchIndex = {
  outgoingBySourcePath: new Map(),
  incomingByTargetPath: new Map(),
};

/**
 * Extract an asserted label only from an explicitly displayed ordinary link.
 * An alias equal to the target card's address remains an ordinary card link.
 */
export function explicitBranchLabel(
  reference: BranchLinkReference,
  enabled: boolean,
  targetAddress?: string,
): string | null {
  if (!enabled) {
    return null;
  }
  const displayText = explicitDisplayText(reference);
  if (
    displayText === null ||
    !displayText.startsWith(EXPLICIT_BRANCH_MARKER) ||
    displayText === targetAddress
  ) {
    return null;
  }
  const label = displayText.slice(EXPLICIT_BRANCH_MARKER.length).trim();
  return label === "" ? null : label;
}

/** Build deterministic incoming and outgoing maps over filed cards only. */
export function indexExplicitBranches(
  sources: readonly ExplicitBranchSource[],
  options: ExplicitBranchIndexOptions,
): ExplicitBranchIndex {
  if (!options.enabled) {
    return EMPTY_EXPLICIT_BRANCH_INDEX;
  }
  const orderedSources = [...sources].sort((left, right) =>
    left.deckIndex - right.deckIndex || compareText(left.path, right.path)
  );
  const filedPaths = new Set(orderedSources.map((source) => source.path));
  const filedAddressesByPath = new Map(
    orderedSources.map((source) => [source.path, source.address]),
  );
  const sourceDeckIndices = new Map(
    orderedSources.map((source) => [source.path, source.deckIndex]),
  );
  const seen = new Set<string>();
  const branches: ExplicitBranch[] = [];

  for (const source of orderedSources) {
    source.links.forEach((reference, sourceOrder) => {
      if (explicitBranchLabel(reference, options.enabled) === null) {
        return;
      }
      const targetPath = options.resolveTargetPath(reference.link, source.path);
      if (
        targetPath === undefined ||
        targetPath === source.path ||
        !filedPaths.has(targetPath)
      ) {
        return;
      }
      const label = explicitBranchLabel(
        reference,
        options.enabled,
        filedAddressesByPath.get(targetPath),
      );
      if (label === null) {
        return;
      }
      const key = JSON.stringify([source.path, targetPath, label]);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      branches.push({
        sourcePath: source.path,
        targetPath,
        label,
        sourceOrder,
      });
    });
  }

  branches.sort((left, right) =>
    (sourceDeckIndices.get(left.sourcePath) ?? Number.MAX_SAFE_INTEGER) -
      (sourceDeckIndices.get(right.sourcePath) ?? Number.MAX_SAFE_INTEGER) ||
    compareText(left.sourcePath, right.sourcePath) ||
    left.sourceOrder - right.sourceOrder ||
    compareText(left.label, right.label) ||
    compareText(left.targetPath, right.targetPath)
  );

  return {
    outgoingBySourcePath: groupBranches(branches, (branch) => branch.sourcePath),
    incomingByTargetPath: groupBranches(branches, (branch) => branch.targetPath),
  };
}

function explicitDisplayText(reference: BranchLinkReference): string | null {
  const original = reference.original.trim();
  if (original.startsWith("!")) {
    return null;
  }
  if (original.startsWith("[[") && original.endsWith("]]")) {
    const separator = original.indexOf("|", 2);
    if (separator < 0) {
      return null;
    }
    return reference.displayText ?? original.slice(separator + 1, -2);
  }
  if (original.startsWith("[") && reference.displayText !== undefined) {
    return reference.displayText;
  }
  return null;
}

function groupBranches(
  branches: readonly ExplicitBranch[],
  keyFor: (branch: ExplicitBranch) => string,
): ReadonlyMap<string, readonly ExplicitBranch[]> {
  const grouped = new Map<string, ExplicitBranch[]>();
  for (const branch of branches) {
    const key = keyFor(branch);
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, [branch]);
    } else {
      existing.push(branch);
    }
  }
  return grouped;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
