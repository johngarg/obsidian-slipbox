import { deckAxis } from "./deck-axis.js";
import { DRAWER_GAP, type CardMotionStyle, type DeckGeometry } from "./deck-motion.js";
import type { DeckRenderWindow } from "./deck-viewport.js";

export interface DeckRenderTransition {
  readonly source: DeckGeometry;
  /** Weighted source layouts preserve a return interrupted before it settled. */
  readonly origins?: readonly DeckMotionOrigin[];
  /** Eased progress, shared with card poses and workspace pan. */
  readonly progress: number;
}

export interface DeckMotionOrigin {
  readonly geometry: DeckGeometry;
  readonly weight: number;
}

/** Invert each linear half of the stack; cost does not depend on vault size. */
export function deckRenderedIndices(count: number, geometry: DeckGeometry, transition?: DeckRenderTransition): readonly number[] {
  if (count === 0 || geometry.anchorIndex < 0) return [];
  const axis = deckAxis(geometry.orientation);
  const extent = axis.extent(geometry.cardWidth, geometry.cardHeight);
  const transverse = axis.extent(geometry.cardHeight, geometry.cardWidth);
  const step = extent * geometry.spread;
  if (!(step > 0)) return [geometry.anchorIndex];
  // Conservative rotation bound includes every possible deterministic splay.
  const half = (extent + transverse * Math.sin(geometry.splay * Math.PI / 180)) / 2;
  const origin = geometry.anchorCoordinate + geometry.panOffset;
  const source = transition?.source ?? geometry;
  const origins = transition?.origins ?? [{ geometry: source, weight: 1 }];
  const progress = transition?.progress ?? 1;
  const sourcePosition = origins.reduce((position, origin) => position + origin.geometry.viewportPosition * origin.weight, 0);
  const position = sourcePosition + (geometry.viewportPosition - sourcePosition) * progress;
  const boundaries = geometry.model === "drawer"
    ? [...new Set([0, ...origins.map((origin) => origin.geometry.anchorIndex + 1), geometry.anchorIndex + 1, count])].sort((a, b) => a - b)
    : [0, count];
  const indices = new Set<number>([geometry.anchorIndex]);
  for (let range = 0; range < boundaries.length - 1; range++) {
    const first = boundaries[range] ?? 0;
    const last = (boundaries[range + 1] ?? count) - 1;
    const gapSize = geometry.model === "drawer" ? extent + DRAWER_GAP - step : 0;
    const fromGap = origins.reduce((gap, origin) => gap + (first > origin.geometry.anchorIndex ? gapSize * origin.weight : 0), 0);
    const toGap = first > geometry.anchorIndex ? gapSize : 0;
    const gap = fromGap + (toGap - fromGap) * progress;
    const low = Math.max(first, Math.ceil(position + (-half - origin - gap) / step) - 2);
    const high = Math.min(last, Math.floor(position + (geometry.paneExtent + half - origin - gap) / step) + 2);
    for (let index = low; index <= high; index++) indices.add(index);
  }
  return [...indices].sort((left, right) => left - right);
}

/** The map describes the enclosing range; rendering may retain a separate anchor. */
export function deckRenderWindow(count: number, geometry: DeckGeometry, transition?: DeckRenderTransition): DeckRenderWindow | null {
  const indices = deckRenderedIndices(count, geometry, transition);
  const start = indices[0];
  const end = indices[indices.length - 1];
  return start === undefined || end === undefined ? null : { start, end };
}

/** Keep only mounted transitions whose remaining sweep can enter the buffered pane. */
export function deckTransitionIntersects(
  geometry: DeckGeometry,
  displayed: CardMotionStyle,
  target: CardMotionStyle,
  targetPanOffset = geometry.panOffset,
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
  const destination = geometry.anchorCoordinate + targetPanOffset;
  const low = Math.min(origin + displayed.along, destination + target.along) - half;
  const high = Math.max(origin + displayed.along, destination + target.along) + half;
  return high >= -buffer && low <= geometry.paneExtent + buffer;
}
