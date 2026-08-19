export interface CardMotionStyle {
  readonly translateX: number;
  readonly scale: number;
  readonly opacity: number;
}

/**
 * Position the newly rendered card window where the old window was.
 *
 * `indexDelta` is target index minus previous active index. A released drag is
 * added so snapping continues from the user's actual last pointer position.
 */
export function transitionStripOffset(
  indexDelta: number,
  cardStep: number,
  releasedDragOffset = 0,
): number {
  return indexDelta * cardStep + releasedDragOffset;
}

/** Compute the visual state of one card within a translated Deck strip. */
export function cardMotionStyle(
  cardOffset: number,
  cardStep: number,
  stripOffset: number,
): CardMotionStyle {
  const safeStep = Math.max(cardStep, 1);
  const distance = Math.abs(cardOffset + stripOffset / safeStep);
  return {
    translateX: cardOffset * cardStep + stripOffset,
    scale: Math.max(0.86, 1 - distance * 0.035),
    opacity: Math.max(0.42, 1 - distance * 0.13),
  };
}
