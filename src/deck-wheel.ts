import { deckAxis } from "./deck-axis.js";
import type { DeckOrientation } from "./settings.js";

export const DECK_WHEEL_GESTURE_IDLE_MS = 180;

export interface DeckWheelContext {
  readonly orientation: DeckOrientation;
  readonly policy: "body-first" | "deck";
  readonly allowCardScrolling: boolean;
  readonly anchor: HTMLElement | null;
  readonly editor: HTMLElement | null;
  readonly paneExtent: number;
  readonly now: number;
}

export interface DeckWheelResult {
  readonly consume: boolean;
  readonly delta: number;
}

/** Routes wheel input without changing scroll positions or dispatching navigation. */
export class DeckWheelController {
  private target: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private direction = 0;
  private lastTime = 0;
  private accumulated = 0;
  private released = false;

  reset(): void {
    this.target = null; this.anchor = null; this.direction = 0;
    this.accumulated = 0; this.released = false; this.lastTime = 0;
  }

  /** Keep a transaction's target connected so later events still reach the stage. */
  retainsCard(card: HTMLElement): boolean {
    return this.released && this.target !== null && card.contains(this.target);
  }

  route(event: WheelEvent, context: DeckWheelContext): DeckWheelResult {
    const native = { consume: false, delta: 0 };
    const path = event.composedPath();
    const hasClass = (target: EventTarget, name: string): boolean =>
      (target as { classList?: DOMTokenList }).classList?.contains(name) === true;
    if (path.includes(context.editor as EventTarget) ||
      path.some((target) => hasClass(target, "slipbox-local-branch-scroller"))) {
      this.reset(); return native;
    }
    const axis = deckAxis(context.orientation);
    const raw = axis.point(event.deltaX, event.deltaY);
    const cross = axis.point(event.deltaY, event.deltaX);
    if (Math.abs(raw) <= Math.abs(cross)) return native;
    const delta = raw * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? context.paneExtent : 1);
    if (context.orientation === "horizontal") { this.reset(); return { consume: true, delta }; }
    const body = path.find((target) => hasClass(target, "slipbox-card-scroll")) as HTMLElement | undefined;
    const targetCard = path.find((target) => hasClass(target, "slipbox-card")) as HTMLElement | undefined;
    if (context.now - this.lastTime > DECK_WHEEL_GESTURE_IDLE_MS) this.reset();
    // Wheel transactions can keep targeting their starting body after selection
    // has advanced. Once browsing starts, keep the gesture with the Deck until
    // it pauses, including reversals and retargeting to the new anchor.
    if (this.released && (body === undefined || body === this.target || context.anchor?.contains(body))) {
      this.target = body ?? targetCard ?? null; this.lastTime = context.now;
      return { consume: true, delta };
    }
    if (body === undefined) {
      this.reset(); this.target = targetCard ?? null; this.released = true; this.lastTime = context.now;
      return { consume: true, delta };
    }
    if (!context.anchor?.contains(body)) { this.reset(); return native; }
    const direction = Math.sign(delta);
    if (this.target !== body || this.anchor !== context.anchor || direction !== this.direction) this.reset();
    this.target = body; this.anchor = context.anchor; this.direction = direction; this.lastTime = context.now;
    if (!context.allowCardScrolling || context.policy === "deck" || hasClass(body, "is-card-scroll-clipped")) {
      this.released = true; return { consume: true, delta };
    }
    if (body.scrollHeight <= body.clientHeight + 1) { this.released = true; return { consume: true, delta }; }
    if (direction < 0 ? body.scrollTop > 1 : body.scrollTop + body.clientHeight < body.scrollHeight - 1) {
      this.accumulated = 0; this.released = false; return native;
    }
    const resisted = Math.min(Math.abs(delta), 48 - this.accumulated);
    this.accumulated += resisted;
    if (this.accumulated >= 48) this.released = true;
    return { consume: true, delta: direction * (Math.abs(delta) - resisted) || 0 };
  }
}
