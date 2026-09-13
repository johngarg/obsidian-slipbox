import type { CardSize, DeckOrientation } from "./settings.js";

/** The only conversion between Deck coordinates and screen coordinates. */
export function deckAxis(orientation: DeckOrientation) {
  const vertical = orientation === "vertical";
  return {
    extent: (width: number, height: number): number => vertical ? height : width,
    point: (x: number, y: number): number => vertical ? y : x,
    screen: (along: number, across: number): { x: number; y: number } =>
      vertical ? { x: across, y: along } : { x: along, y: across },
    previousKey: vertical ? "ArrowUp" : "ArrowLeft",
    nextKey: vertical ? "ArrowDown" : "ArrowRight",
  };
}

/** Initialization fallback until the mounted CSS sizing probe is measurable. */
export function deckCardDimensions(size: CardSize): { width: number; height: number } {
  const width = size === "small" ? 720 : size === "large" ? 960 : 840;
  return { width, height: width * 2 / 3 };
}
