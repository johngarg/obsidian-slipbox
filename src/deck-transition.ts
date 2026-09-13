import { cardMotionStyle, type CardMotionStyle, type DeckGeometry } from "./deck-motion.js";
import type { DeckMotionOrigin, DeckRenderTransition } from "./deck-render-window.js";

export interface DeckPan {
  readonly x: number;
  readonly y: number;
}

export interface DeckSelectionMotion {
  readonly from: DeckPan;
  readonly to: DeckPan;
  readonly geometry: DeckGeometry;
}

/** Interrupted transitions start from the last displayed pose, never a stale target. */
export class DeckTransition {
  private origins = new Map<string, CardMotionStyle>();
  private displayed = new Map<string, CardMotionStyle>();
  private startedAt: number | null = null;
  private selection: DeckSelectionMotion | null = null;
  private panning = false;
  private sourceLayouts: readonly DeckMotionOrigin[] = [];
  private displayedAt = 0;
  private duration = 0;

  begin(now: number, selection: DeckSelectionMotion | null = null): void {
    if (selection !== null) {
      const progress = this.selection === null ? 1 : this.progress(this.displayedAt, this.duration);
      // Combine equal layouts and discard only contributions below floating-point
      // precision, so rapid interrupted clicks do not build recursive histories.
      const layouts = [...this.sourceLayouts.map((origin) => ({
        geometry: origin.geometry, weight: origin.weight * (1 - progress),
      })), { geometry: selection.geometry, weight: progress }];
      const merged = new Map<string, DeckMotionOrigin>();
      for (const origin of layouts) {
        if (origin.weight <= Number.EPSILON) continue;
        const key = `${origin.geometry.anchorIndex}:${origin.geometry.viewportPosition}`;
        merged.set(key, { geometry: origin.geometry, weight: origin.weight + (merged.get(key)?.weight ?? 0) });
      }
      this.sourceLayouts = [...merged.values()];
    } else {
      this.sourceLayouts = [];
    }
    this.origins = new Map(this.displayed);
    this.startedAt = now;
    this.selection = selection;
    this.panning = selection !== null;
  }

  private progress(now: number, duration: number): number {
    const progress = this.startedAt === null || duration <= 0 ? 1
      : Math.min(1, Math.max(0, (now - this.startedAt) / duration));
    return 1 - (1 - progress) ** 3;
  }

  pose(path: string, target: CardMotionStyle, now: number, duration: number, cardIndex?: number): CardMotionStyle {
    const from = this.origins.get(path) ?? (this.selection !== null && cardIndex !== undefined
      ? this.sourcePose(cardIndex) : undefined);
    const t = this.progress(now, duration);
    const pose = from === undefined || t === 1 ? target : {
      along: from.along + (target.along - from.along) * t,
      across: from.across + (target.across - from.across) * t,
      rotation: from.rotation + (target.rotation - from.rotation) * t,
      scale: target.scale,
      opacity: from.opacity + (target.opacity - from.opacity) * t,
    };
    this.displayed.set(path, pose);
    this.displayedAt = now;
    this.duration = duration;
    return pose;
  }

  private sourcePose(cardIndex: number): CardMotionStyle {
    const pose = { along: 0, across: 0, rotation: 0, scale: 1, opacity: 0 };
    for (const { geometry, weight } of this.sourceLayouts) {
      const source = cardMotionStyle({ ...geometry, cardIndex });
      pose.along += source.along * weight;
      pose.across += source.across * weight;
      pose.rotation += source.rotation * weight;
      pose.opacity += source.opacity * weight;
    }
    return pose;
  }

  /** Pan and card poses share the same clock and easing, including interruption. */
  pan(now: number, duration: number): DeckPan | null {
    if (!this.panning || this.selection === null) return null;
    const { from, to } = this.selection;
    const t = this.progress(now, duration);
    if (t === 1) this.panning = false;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  get panTarget(): DeckPan | null {
    return this.panning ? this.selection?.to ?? null : null;
  }

  cancelPan(): void {
    this.panning = false;
  }

  rendering(now: number, duration: number): DeckRenderTransition | undefined {
    return this.selection !== null && this.active(now, duration)
      ? { source: this.selection.geometry, origins: this.sourceLayouts, progress: this.progress(now, duration) }
      : undefined;
  }

  active(now: number, duration: number): boolean {
    return this.startedAt !== null && now - this.startedAt < duration;
  }

  displayedPose(path: string): CardMotionStyle | undefined {
    return this.displayed.get(path);
  }

  retain(paths: ReadonlySet<string>): void {
    for (const path of this.displayed.keys()) if (!paths.has(path)) this.displayed.delete(path);
    for (const path of this.origins.keys()) if (!paths.has(path)) this.origins.delete(path);
  }

  reset(): void {
    this.origins.clear(); this.displayed.clear(); this.startedAt = null;
    this.selection = null; this.panning = false;
    this.sourceLayouts = []; this.displayedAt = 0; this.duration = 0;
  }
}
