import type { FiledCardRecord } from "./card-metadata.js";

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
 * The filed collection has already excluded ordinary, unfiled, and malformed
 * notes. Keeping the result keyed by target path preserves exact file identity
 * while the retained records provide address presentation.
 */
export function indexFiledBacklinks<T extends FiledCardRecord>(
  filed: readonly T[],
  resolvedLinks: ResolvedLinks,
): ReadonlyMap<string, readonly T[]> {
  const filedByPath = new Map(filed.map((card) => [card.path, card]));
  const filedRank = new Map(filed.map((card, index) => [card.path, index]));
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
    sources.sort((left, right) =>
      (filedRank.get(left.path) ?? -1) - (filedRank.get(right.path) ?? -1));
  }
  return sourcesByTarget;
}

/** Choose the longest leading run of complete addresses that fits beside `+N`. */
export function fitBacklinkPrefix(
  availableWidth: number,
  itemWidths: readonly number[],
  separatorWidth: number,
  overflowWidth: (hiddenCount: number) => number,
): BacklinkFit {
  return fitMeasuredBacklinkPrefix(
    availableWidth,
    itemWidths,
    itemWidths.length,
    separatorWidth,
    overflowWidth,
  );
}

/**
 * Fit a backlink prefix when only a bounded leading set has DOM measurements.
 * `totalCount` may exceed `itemWidths.length`; the unmeasured tail is always
 * represented by the overflow control.
 */
export function fitMeasuredBacklinkPrefix(
  availableWidth: number,
  itemWidths: readonly number[],
  totalCount: number,
  separatorWidth: number,
  overflowWidth: (hiddenCount: number) => number,
): BacklinkFit {
  const widths = itemWidths.map((width) => Math.max(0, width));
  const available = Math.max(0, availableWidth);
  const separator = Math.max(0, separatorWidth);
  const count = Number.isInteger(totalCount)
    ? Math.max(widths.length, totalCount)
    : widths.length;
  let bestVisibleCount = 0;
  let prefixWidth = 0;

  for (let visibleCount = 0; visibleCount <= widths.length; visibleCount += 1) {
    const hiddenCount = count - visibleCount;
    const widthWithOverflow = prefixWidth +
      (hiddenCount > 0 && visibleCount > 0 ? separator : 0) +
      (hiddenCount > 0 ? Math.max(0, overflowWidth(hiddenCount)) : 0);
    if (widthWithOverflow <= available) {
      bestVisibleCount = visibleCount;
    }
    const nextWidth = widths[visibleCount];
    if (nextWidth !== undefined) {
      prefixWidth += (visibleCount > 0 ? separator : 0) + nextWidth;
    }
  }

  return {
    visibleCount: bestVisibleCount,
    hiddenCount: count - bestVisibleCount,
  };
}
