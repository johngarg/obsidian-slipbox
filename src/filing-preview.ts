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

/** Message shown when the duplicate policy refuses an occupied address. */
export function duplicateFilingMessage(
  address: string,
  occupants: number,
): string {
  return `${address} is already used by ${occupants} card${
    occupants === 1 ? "" : "s"
  }. Duplicate addresses are not allowed.`;
}

/** Seed manual filing from the currently focused filed card, when available. */
export function initialFilingAddress(
  focusedCard: Pick<AddressedPath, "address"> | null | undefined,
): string {
  return focusedCard?.address ?? "";
}

/**
 * Focus the real card immediately before the candidate. At the beginning,
 * where there is no predecessor, use the first real card as spatial context.
 */
export function filingPreviewFocusPath(preview: FilingPreview): string | null {
  return preview.previousPath ?? preview.nextPath;
}

/** Explain the keyboard preview relative to the candidate's current position. */
export function filingPreviewGuidance(preview: FilingPreview | null): string {
  if (preview === null) {
    return "Enter a valid address. Tab previews its Deck position; Enter files.";
  }
  if (preview.previousPath !== null) {
    return "Tab focuses the Deck card this card will be filed after. Shift+Tab returns here; Enter files.";
  }
  if (preview.nextPath !== null) {
    return "Tab focuses the first Deck card; this card will be filed before it. Shift+Tab returns here; Enter files.";
  }
  return "The Deck is empty. Enter files this card as its first card.";
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
