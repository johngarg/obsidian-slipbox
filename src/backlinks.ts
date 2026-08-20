import { compareZettelIds } from "./zettel-id.js";
import type { FiledZettelRecord } from "./zettel-metadata.js";

export type ResolvedLinks = Readonly<
  Record<string, Readonly<Record<string, number>>>
>;

export interface BacklinkFit {
  readonly visibleCount: number;
  readonly hiddenCount: number;
}

/**
 * Derive unique filed-card backlinks from Obsidian's resolved file graph.
 *
 * The filed collection has already excluded ordinary, unfiled, malformed, and
 * duplicate-address notes. Keeping the result keyed by target path preserves
 * file identity while the retained records provide zettel-id presentation.
 */
export function indexFiledBacklinks<T extends FiledZettelRecord>(
  filed: readonly T[],
  resolvedLinks: ResolvedLinks,
): ReadonlyMap<string, readonly T[]> {
  const filedByPath = new Map(filed.map((card) => [card.path, card]));
  const sourcesByTarget = new Map<string, T[]>();

  for (const [sourcePath, destinations] of Object.entries(resolvedLinks)) {
    const source = filedByPath.get(sourcePath);
    if (source === undefined) {
      continue;
    }

    for (const [targetPath, count] of Object.entries(destinations)) {
      if (
        count <= 0 ||
        sourcePath === targetPath ||
        !filedByPath.has(targetPath)
      ) {
        continue;
      }
      const sources = sourcesByTarget.get(targetPath) ?? [];
      sources.push(source);
      sourcesByTarget.set(targetPath, sources);
    }
  }

  for (const sources of sourcesByTarget.values()) {
    sources.sort((left, right) => compareZettelIds(left.id, right.id));
  }
  return sourcesByTarget;
}

/** Choose the longest leading run of complete IDs that fits beside `+N`. */
export function fitBacklinkPrefix(
  availableWidth: number,
  itemWidths: readonly number[],
  separatorWidth: number,
  overflowWidth: (hiddenCount: number) => number,
): BacklinkFit {
  const widths = itemWidths.map((width) => Math.max(0, width));
  const available = Math.max(0, availableWidth);
  const separator = Math.max(0, separatorWidth);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) +
    separator * Math.max(0, widths.length - 1);

  if (totalWidth <= available) {
    return { visibleCount: widths.length, hiddenCount: 0 };
  }

  let prefixWidth = totalWidth;
  for (let visibleCount = widths.length - 1; visibleCount >= 0; visibleCount -= 1) {
    const removedIndex = visibleCount;
    const removedWidth = widths[removedIndex] ?? 0;
    prefixWidth -= removedWidth;
    if (visibleCount > 0) {
      prefixWidth -= separator;
    }
    const hiddenCount = widths.length - visibleCount;
    const widthWithOverflow = prefixWidth +
      (visibleCount > 0 ? separator : 0) +
      Math.max(0, overflowWidth(hiddenCount));
    if (widthWithOverflow <= available) {
      return { visibleCount, hiddenCount };
    }
  }

  return { visibleCount: 0, hiddenCount: widths.length };
}
