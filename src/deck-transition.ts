import type { CardMotionStyle } from "./deck-motion.js";

/** Interrupted transitions start from the last displayed pose, never a stale target. */
export class DeckTransition {
  private origins = new Map<string, CardMotionStyle>();
  private displayed = new Map<string, CardMotionStyle>();
  private startedAt: number | null = null;

  begin(now: number): void {
    this.origins = new Map(this.displayed);
    this.startedAt = now;
  }

  pose(path: string, target: CardMotionStyle, now: number, duration: number): CardMotionStyle {
    const from = this.origins.get(path);
    const progress = this.startedAt === null ? 1 : Math.min(1, Math.max(0, (now - this.startedAt) / duration));
    const t = 1 - (1 - progress) ** 3;
    const pose = from === undefined || progress === 1 ? target : {
      along: from.along + (target.along - from.along) * t,
      across: from.across + (target.across - from.across) * t,
      rotation: from.rotation + (target.rotation - from.rotation) * t,
      scale: target.scale,
      opacity: from.opacity + (target.opacity - from.opacity) * t,
    };
    this.displayed.set(path, pose);
    return pose;
  }

  active(now: number, duration: number): boolean {
    return this.startedAt !== null && now - this.startedAt < duration;
  }

  retain(paths: ReadonlySet<string>): void {
    for (const path of this.displayed.keys()) if (!paths.has(path)) this.displayed.delete(path);
  }

  reset(): void {
    this.origins.clear(); this.displayed.clear(); this.startedAt = null;
  }
}
