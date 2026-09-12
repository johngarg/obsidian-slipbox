import { deckAxis } from "./deck-axis.js";
import { DRAWER_GAP, type CardMotionStyle, type DeckGeometry } from "./deck-motion.js";
import type { DeckRenderWindow } from "./deck-viewport.js";

/** Invert each linear half of the stack; cost does not depend on vault size. */
export function deckRenderedIndices(count: number, geometry: DeckGeometry): readonly number[] {
  if (count === 0 || geometry.anchorIndex < 0) return [];
  const axis = deckAxis(geometry.orientation);
  const extent = axis.extent(geometry.cardWidth, geometry.cardHeight);
  const transverse = axis.extent(geometry.cardHeight, geometry.cardWidth);
  const step = extent * geometry.spread;
  if (!(step > 0)) return [geometry.anchorIndex];
  // Conservative rotation bound includes every possible deterministic tilt.
  const half = (extent + transverse * Math.sin(geometry.tilt * Math.PI / 180)) / 2;
  const origin = geometry.anchorCoordinate + geometry.panOffset;
  const ranges: Array<readonly [number, number, number]> = geometry.model === "drawer"
    ? [[0, geometry.anchorIndex, 0], [geometry.anchorIndex + 1, count - 1, extent + DRAWER_GAP - step]]
    : [[0, count - 1, 0]];
  const indices = new Set<number>([geometry.anchorIndex]);
  for (const [first, last, gap] of ranges) {
    const low = Math.max(first, Math.ceil(geometry.viewportPosition + (-half - origin - gap) / step) - 2);
    const high = Math.min(last, Math.floor(geometry.viewportPosition + (geometry.paneExtent + half - origin - gap) / step) + 2);
    for (let index = low; index <= high; index++) indices.add(index);
  }
  return [...indices].sort((left, right) => left - right);
}

/** The map describes the enclosing range; rendering may retain a separate anchor. */
export function deckRenderWindow(count: number, geometry: DeckGeometry): DeckRenderWindow | null {
  const indices = deckRenderedIndices(count, geometry);
  const start = indices[0];
  const end = indices[indices.length - 1];
  return start === undefined || end === undefined ? null : { start, end };
}

/** Keep only mounted transitions whose remaining sweep can enter the buffered pane. */
export function deckTransitionIntersects(
  geometry: DeckGeometry,
  displayed: CardMotionStyle,
  target: CardMotionStyle,
): boolean {
  const axis = deckAxis(geometry.orientation);
  const extent = axis.extent(geometry.cardWidth, geometry.cardHeight);
  const transverse = axis.extent(geometry.cardHeight, geometry.cardWidth);
  // Rotation interpolates between the two endpoints. This deliberately bounds
  // every intermediate footprint, not just the endpoint rectangles.
  const angle = Math.max(Math.abs(displayed.rotation), Math.abs(target.rotation)) * Math.PI / 180;
  const half = (extent + transverse * Math.sin(angle)) * Math.max(displayed.scale, target.scale) / 2;
  const origin = geometry.anchorCoordinate + geometry.panOffset;
  const buffer = extent * geometry.spread * 2;
  const low = origin + Math.min(displayed.along, target.along) - half;
  const high = origin + Math.max(displayed.along, target.along) + half;
  return high >= -buffer && low <= geometry.paneExtent + buffer;
}
