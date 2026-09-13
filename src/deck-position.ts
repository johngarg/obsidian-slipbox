import type { DeckOrientation, DeckStackModel } from "./settings.js";

export type DeckPositionMode = "top" | "centered" | "bottom";
export type HorizontalDeckPositionMode = "left" | "centered" | "right";
export type DeckPositionTarget = DeckPositionMode | HorizontalDeckPositionMode;

export interface DeckPositionAxes {
  readonly x: boolean;
  readonly y: boolean;
}

/** Drawer defaults to the middle of its sequence, without choosing either axis. */
export function resolvedDeckVerticalPosition(
  orientation: DeckOrientation,
  model: DeckStackModel,
  override: DeckPositionMode | null,
  startupMode: DeckPositionMode,
): DeckPositionMode {
  return override ?? (orientation === "vertical" && model === "drawer" ? "centered" : startupMode);
}

/** Positioning one axis must leave the other axis's alignment and pan intact. */
export function deckPositionAxes(target: DeckPositionTarget): DeckPositionAxes {
  return {
    x: target === "left" || target === "right" || target === "centered",
    y: target === "top" || target === "bottom" || target === "centered",
  };
}

export function deckAnchorCenterX(
  paneWidth: number,
  cardWidth: number,
  orientation: DeckOrientation,
  mode: HorizontalDeckPositionMode,
): number {
  return deckAnchorCenter(paneWidth, cardWidth, orientation === "horizontal",
    mode === "left" ? "before" : mode === "right" ? "after" : "centered");
}

export function deckAnchorCenterY(
  paneHeight: number,
  cardHeight: number,
  orientation: DeckOrientation,
  mode: DeckPositionMode,
): number {
  return deckAnchorCenter(paneHeight, cardHeight, orientation === "vertical",
    mode === "top" ? "before" : mode === "bottom" ? "after" : "centered");
}

/** Keep the fixed card inside the pane, or expose the requested edge if it cannot fit. */
function deckAnchorCenter(
  paneExtent: number,
  cardExtent: number,
  alongSequence: boolean,
  mode: "before" | "centered" | "after",
): number {
  if (!Number.isFinite(paneExtent) || !Number.isFinite(cardExtent) ||
      paneExtent <= 0 || cardExtent <= 0) return 0;
  if (mode === "centered") return paneExtent / 2;

  const half = cardExtent / 2;
  const inset = 12;
  if (cardExtent > paneExtent) {
    return mode === "before" ? half + inset : paneExtent - half - inset;
  }

  const margin = Math.min(inset, (paneExtent - cardExtent) / 2);
  const beforePercent = alongSequence ? 22 : 33;
  const fraction = (mode === "before" ? beforePercent : 100 - beforePercent) / 100;
  return Math.max(half + margin,
    Math.min(paneExtent - half - margin, paneExtent * fraction));
}
