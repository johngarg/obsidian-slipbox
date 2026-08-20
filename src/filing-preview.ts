import {
  candidateInsertionIndex,
  type AddressedPath,
  type DeckOrdering,
} from "./address-order.js";

export interface FilingPreview {
  readonly sourcePath: string;
  readonly address: string;
  readonly title: string;
  readonly insertionIndex: number;
  readonly previousPath: string | null;
  readonly nextPath: string | null;
  readonly ordering: DeckOrdering;
  readonly placementSignature: string;
}

export interface FiledDisplayItem<T extends AddressedPath> {
  readonly kind: "filed";
  readonly card: T;
  readonly filedIndex: number;
  readonly displayIndex: number;
}

export interface PreviewDisplayItem {
  readonly kind: "preview";
  readonly preview: FilingPreview;
  readonly displayIndex: number;
  readonly key: string;
}

export type DeckDisplayItem<T extends AddressedPath> =
  | FiledDisplayItem<T>
  | PreviewDisplayItem;

export function filingPreviewKey(sourcePath: string): string {
  return `filing-preview:${sourcePath}`;
}

/** Seed manual filing from the currently focused filed card, when available. */
export function initialFilingAddress(
  focusedCard: Pick<AddressedPath, "address"> | null | undefined,
): string {
  return focusedCard?.address ?? "";
}

/**
 * Focus the real card immediately before the candidate so the insertion gap
 * and ghost remain prominent. At the beginning (and in an empty Deck), the
 * ghost itself is the only useful focus target.
 */
export function defaultFilingFocusIndex(preview: FilingPreview): number {
  return Math.max(0, preview.insertionIndex - 1);
}

export function createFilingPreview<T extends AddressedPath>(
  filed: readonly T[],
  candidate: AddressedPath,
  title: string,
  ordering: DeckOrdering,
): FilingPreview {
  const insertionIndex = candidateInsertionIndex(filed, candidate, ordering);
  const previousPath = filed[insertionIndex - 1]?.path ?? null;
  const nextPath = filed[insertionIndex]?.path ?? null;
  const placementSignature = JSON.stringify([
    candidate.path,
    candidate.address,
    ordering,
    insertionIndex,
    previousPath,
    nextPath,
  ]);
  return {
    sourcePath: candidate.path,
    address: candidate.address,
    title,
    insertionIndex,
    previousPath,
    nextPath,
    ordering,
    placementSignature,
  };
}

export function deckDisplayItems<T extends AddressedPath>(
  filed: readonly T[],
  preview: FilingPreview | null,
): readonly DeckDisplayItem<T>[] {
  if (preview === null) {
    return filed.map((card, filedIndex) => ({
      kind: "filed",
      card,
      filedIndex,
      displayIndex: filedIndex,
    }));
  }

  const items: DeckDisplayItem<T>[] = filed.map((card, filedIndex) => ({
    kind: "filed",
    card,
    filedIndex,
    displayIndex:
      filedIndex < preview.insertionIndex ? filedIndex : filedIndex + 1,
  }));
  items.splice(preview.insertionIndex, 0, {
    kind: "preview",
    preview,
    displayIndex: preview.insertionIndex,
    key: filingPreviewKey(preview.sourcePath),
  });
  return items;
}

export function filingPlacementMatches<T extends AddressedPath>(
  filed: readonly T[],
  candidate: AddressedPath,
  ordering: DeckOrdering,
  preview: FilingPreview,
): boolean {
  if (
    preview.sourcePath !== candidate.path ||
    preview.address !== candidate.address ||
    preview.ordering !== ordering
  ) {
    return false;
  }
  return createFilingPreview(
    filed,
    candidate,
    preview.title,
    ordering,
  ).placementSignature === preview.placementSignature;
}
