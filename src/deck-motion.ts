import type { DeckOrientation, DeckStackModel } from "./settings.js";
import { deckAxis } from "./deck-axis.js";

export interface CardMotionStyle {
  readonly along: number;
  readonly across: number;
  readonly rotation: number;
  readonly scale: number;
  readonly opacity: number;
}

export const CARD_STACK_ORDER_PROPERTY = "--slipbox-card-z-index";
export const CARD_OPACITY_PROPERTY = "--slipbox-card-opacity";

/** Keep computed Deck motion overridable by temporary CSS interaction states. */
export function setCardStackOrder(card: HTMLElement, order: number): void {
  card.style.setProperty(CARD_STACK_ORDER_PROPERTY, String(order));
}

export function setCardMotionOpacity(card: HTMLElement, opacity: number): void {
  card.style.setProperty(CARD_OPACITY_PROPERTY, String(opacity));
}

export const DEFAULT_ACTIVE_HYSTERESIS = 0.06;
/** Keep card surfaces in one physical stack ordered around the Deck anchor. */
export function cardStackOrder(
  cardIndex: number,
  activeIndex: number,
  model: DeckStackModel = "fan",
): number {
  if (model === "drawer") return cardIndex + 1;
  return cardIndex === activeIndex
    ? 220
    : 100 - Math.abs(cardIndex - activeIndex);
}

export interface BookmarkEdgeTargets {
  readonly before: number | null;
  readonly after: number | null;
}

/** Select the closest bookmark before or after the active Deck position. */
export function adjacentBookmarkIndex(
  bookmarkIndices: readonly number[],
  activeIndex: number,
  direction: -1 | 1,
): number | null {
  let target: number | null = null;
  for (const index of bookmarkIndices) {
    if (direction < 0) {
      if (index < activeIndex && (target === null || index > target)) {
        target = index;
      }
    } else if (index > activeIndex && (target === null || index < target)) {
      target = index;
    }
  }
  return target;
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
export interface DeckGeometry extends Omit<CardMotionOptions, "cardIndex"> {
  readonly paneExtent: number;
  readonly anchorCoordinate: number;
  readonly panOffset: number;
}

/** A clipped bookmark remains reachable even when overlapping cards obscure it. */
export function bookmarkEdgeTargets(
  bookmarkIndices: readonly number[], geometry: DeckGeometry,
): BookmarkEdgeTargets {
  if (!(geometry.spread > 0) || geometry.paneExtent <= 0) return { before: null, after: null };
  let before: number | null = null;
  let after: number | null = null;
  let beforeCentre = -Infinity;
  let afterCentre = Infinity;
  for (const cardIndex of bookmarkIndices) {
    const options = { ...geometry, cardIndex };
    const motion = cardMotionStyle(options);
    const centre = geometry.anchorCoordinate + geometry.panOffset + motion.along;
    const half = cardFootprint(options, motion);
    if (centre - half < 0 && centre > beforeCentre) {
      before = cardIndex; beforeCentre = centre;
    }
    if (centre + half > geometry.paneExtent && centre < afterCentre) {
      after = cardIndex; afterCentre = centre;
    }
  }
  return { before, after };
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
 * The previous Deck anchor remains selected until the viewport crosses the
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
export interface CardMotionOptions {
  readonly cardIndex: number;
  readonly anchorIndex: number;
  readonly viewportPosition: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly spread: number;
  readonly orientation: DeckOrientation;
  readonly model: DeckStackModel;
  readonly tilt: number;
}

export const DRAWER_GAP = 12;

export function cardJitter(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function cardMotionStyle(options: CardMotionOptions): CardMotionStyle {
  const { cardIndex, anchorIndex, viewportPosition, model, orientation, tilt } = options;
  const extent = deckAxis(orientation).extent(options.cardWidth, options.cardHeight);
  const step = Math.max(1, extent * options.spread);
  const d = cardIndex - anchorIndex;
  const isActive = d === 0;
  const distance = Math.abs(d);
  const along = (cardIndex - viewportPosition) * step +
    (model === "drawer" && d > 0 ? extent + DRAWER_GAP - step : 0);
  const distanceScale = Math.max(0.86, 1 - distance * 0.035);
  return {
    along,
    across: isActive ? 0 : cardJitter(cardIndex, 2) * tilt * 16,
    rotation: isActive ? 0 : cardJitter(cardIndex, 1) * tilt,
    scale: model === "drawer" || orientation === "vertical" ? 1
      : isActive ? Math.max(0.98, distanceScale) : distanceScale,
    opacity: isActive ? 1 : model === "drawer" ? Math.max(0.45, 1 - distance * 0.08)
      : Math.max(0.42, 1 - distance * 0.13),
  };
}

/** Half of the rotated footprint along the Deck axis. */
export function cardFootprint(options: CardMotionOptions, motion = cardMotionStyle(options)): number {
  const axis = deckAxis(options.orientation);
  const along = axis.extent(options.cardWidth, options.cardHeight);
  const across = axis.extent(options.cardHeight, options.cardWidth);
  const angle = Math.abs(motion.rotation) * Math.PI / 180;
  return (along * Math.cos(angle) + across * Math.sin(angle)) * motion.scale / 2;
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
