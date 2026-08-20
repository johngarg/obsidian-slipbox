export interface CardMotionStyle {
  readonly translateX: number;
  readonly scale: number;
  readonly opacity: number;
}

export const DEFAULT_ACTIVE_HYSTERESIS = 0.06;
/** Keep card surfaces in one physical stack ordered around the active card. */
export function cardStackOrder(
  cardIndex: number,
  viewportPosition: number,
  activeIndex: number,
): number {
  return cardIndex === activeIndex
    ? 220
    : 100 - Math.floor(Math.abs(cardIndex - viewportPosition));
}

export interface BookmarkEdgeTargets {
  readonly left: number | null;
  readonly right: number | null;
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

  const visibleLimit = stageWidth / 2 + cardWidth / 2;
  let left: number | null = null;
  let leftX = Number.NEGATIVE_INFINITY;
  let right: number | null = null;
  let rightX = Number.POSITIVE_INFINITY;

  for (const index of bookmarkIndices) {
    const x = (index - viewportPosition) * cardStep;
    if (x <= -visibleLimit && x > leftX) {
      left = index;
      leftX = x;
    } else if (x >= visibleLimit && x < rightX) {
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

/** Compute one card's visual state at a continuous viewport position. */
export function cardMotionStyle(
  cardIndex: number,
  viewportPosition: number,
  cardStep: number,
  isActive = false,
): CardMotionStyle {
  const safeStep = Math.max(cardStep, 1);
  const distance = Math.abs(cardIndex - viewportPosition);
  const distanceScale = Math.max(0.86, 1 - distance * 0.035);
  return {
    translateX: (cardIndex - viewportPosition) * safeStep,
    scale: isActive ? Math.max(0.98, distanceScale) : distanceScale,
    opacity: isActive ? 1 : Math.max(0.42, 1 - distance * 0.13),
  };
}

/**
 * Move only far enough for the target card to fit inside the stage.
 *
 * This is used by discrete arrow-key navigation; free pointer and trackpad
 * browsing never calls it.
 */
export function viewportPositionToRevealCard(
  targetIndex: number,
  viewportPosition: number,
  cardCount: number,
  cardStep: number,
  stageWidth: number,
  cardWidth: number,
  margin = 18,
): number {
  if (cardCount <= 0 || cardStep <= 0 || stageWidth <= 0 || cardWidth <= 0) {
    return clampViewportPosition(viewportPosition, cardCount);
  }

  const centreLimit = Math.max(0, (stageWidth - cardWidth) / 2 - margin);
  const targetX = (targetIndex - viewportPosition) * cardStep;
  let nextPosition = viewportPosition;

  if (targetX > centreLimit) {
    nextPosition = targetIndex - centreLimit / cardStep;
  } else if (targetX < -centreLimit) {
    nextPosition = targetIndex + centreLimit / cardStep;
  }
  return clampViewportPosition(nextPosition, cardCount);
}
