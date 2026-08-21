export interface CardMotionStyle {
  readonly translateX: number;
  readonly scale: number;
  readonly opacity: number;
}

export const DEFAULT_ACTIVE_HYSTERESIS = 0.06;
/** Keep card surfaces in one physical stack ordered around the active card. */
export function cardStackOrder(
  cardIndex: number,
  activeIndex: number,
): number {
  return cardIndex === activeIndex
    ? 220
    : 100 - Math.abs(cardIndex - activeIndex);
}

export interface BookmarkEdgeTargets {
  readonly left: number | null;
  readonly right: number | null;
}

/** Keep the physical viewport fixed while changing the selected card. */
export function stationarySelectionOffset(
  previousActiveIndex: number,
  targetIndex: number,
  currentViewportOffset: number,
): number {
  const viewportPosition = previousActiveIndex < 0
    ? targetIndex
    : previousActiveIndex + currentViewportOffset;
  return viewportPosition - targetIndex;
}

/** Select the nearest off-screen bookmark on each side of the Deck. */
export function bookmarkEdgeTargets(
  bookmarkIndices: readonly number[],
  viewportPosition: number,
  cardStep: number,
  stageWidth: number,
  cardWidth: number,
): BookmarkEdgeTargets {
  if (cardStep <= 0 || stageWidth <= 0 || cardWidth <= 0) {
    return { left: null, right: null };
  }

  // Overlap can hide a clipped card even while much of its surface remains in
  // the viewport. Show the bookmark target once the card is no longer fully
  // contained by the stage.
  const visibleLimit = Math.max(0, (stageWidth - cardWidth) / 2);
  let left: number | null = null;
  let leftX = Number.NEGATIVE_INFINITY;
  let right: number | null = null;
  let rightX = Number.POSITIVE_INFINITY;

  for (const index of bookmarkIndices) {
    const x = (index - viewportPosition) * cardStep;
    if (x < -visibleLimit && x > leftX) {
      left = index;
      leftX = x;
    } else if (x > visibleLimit && x < rightX) {
      right = index;
      rightX = x;
    }
  }

  return { left, right };
}

/** Keep the continuous Deck position between its first and last cards. */
export function clampViewportPosition(
  viewportPosition: number,
  cardCount: number,
): number {
  if (cardCount <= 0 || !Number.isFinite(viewportPosition)) {
    return 0;
  }
  return Math.max(0, Math.min(cardCount - 1, viewportPosition));
}

/**
 * Select the card nearest the centre without flickering at a midpoint.
 *
 * The previous active card remains selected until the viewport crosses the
 * midpoint by `hysteresis` card widths. Crossing back requires passing the
 * corresponding threshold on the other side.
 */
export function activeIndexForViewport(
  viewportPosition: number,
  previousActiveIndex: number,
  cardCount: number,
  hysteresis = DEFAULT_ACTIVE_HYSTERESIS,
): number {
  if (cardCount <= 0) {
    return -1;
  }

  const position = clampViewportPosition(viewportPosition, cardCount);
  let activeIndex = Math.max(
    0,
    Math.min(cardCount - 1, Math.trunc(previousActiveIndex)),
  );
  const margin = Math.max(0, Math.min(0.49, hysteresis));

  while (
    activeIndex < cardCount - 1 &&
    position > activeIndex + 0.5 + margin
  ) {
    activeIndex += 1;
  }
  while (
    activeIndex > 0 &&
    position < activeIndex - 0.5 - margin
  ) {
    activeIndex -= 1;
  }
  return activeIndex;
}

/**
 * Compute one card's visual state.
 *
 * Translation follows the continuous viewport, while scale and opacity may be
 * anchored to a separately selected card during discrete keyboard navigation.
 */
export function cardMotionStyle(
  cardIndex: number,
  viewportPosition: number,
  cardStep: number,
  isActive = false,
  focusPosition = viewportPosition,
): CardMotionStyle {
  const safeStep = Math.max(cardStep, 1);
  const focusDistance = Math.abs(cardIndex - focusPosition);
  const distanceScale = Math.max(0.86, 1 - focusDistance * 0.035);
  return {
    translateX: (cardIndex - viewportPosition) * safeStep,
    scale: isActive ? Math.max(0.98, distanceScale) : distanceScale,
    opacity: isActive ? 1 : Math.max(0.42, 1 - focusDistance * 0.13),
  };
}

/** Use a selected card's index as the centred discrete viewport target. */
export function centredViewportPosition(
  targetIndex: number,
  cardCount: number,
): number {
  return clampViewportPosition(targetIndex, cardCount);
}

/** Move an integral number of Deck positions and clamp at either boundary. */
export function deckIndexByDelta(
  activeIndex: number,
  delta: number,
  cardCount: number,
): number {
  if (cardCount <= 0 || activeIndex < 0 || activeIndex >= cardCount) {
    return -1;
  }
  return Math.max(
    0,
    Math.min(cardCount - 1, activeIndex + Math.trunc(delta)),
  );
}
