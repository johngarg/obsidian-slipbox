import { deckAxis } from "./deck-axis.js";
import type { DeckOrientation } from "./settings.js";

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
  private target: EventTarget | null = null;
  private anchor: HTMLElement | null = null;
  private direction = 0;
  private lastTime = 0;
  private accumulated = 0;
  private released = false;

  reset(): void {
    this.target = null; this.anchor = null; this.direction = 0;
    this.accumulated = 0; this.released = false; this.lastTime = 0;
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
    if (context.orientation === "horizontal") return { consume: true, delta };
    const body = path.find((target) => hasClass(target, "slipbox-card-scroll")) as HTMLElement | undefined;
    if (body === undefined) { this.reset(); return { consume: true, delta }; }
    if (!context.anchor?.contains(body)) { this.reset(); return native; }
    if (!context.allowCardScrolling || context.policy === "deck" || hasClass(body, "is-card-scroll-clipped")) {
      this.reset(); return { consume: true, delta };
    }
    if (body.scrollHeight <= body.clientHeight + 1) { this.reset(); return { consume: true, delta }; }
    const direction = Math.sign(delta);
    if (this.target !== body || this.anchor !== context.anchor || direction !== this.direction || context.now - this.lastTime > 180) {
      this.reset();
    }
    this.target = body; this.anchor = context.anchor; this.direction = direction; this.lastTime = context.now;
    if (direction < 0 ? body.scrollTop > 1 : body.scrollTop + body.clientHeight < body.scrollHeight - 1) {
      this.accumulated = 0; this.released = false; return native;
    }
    if (this.released) return { consume: true, delta };
    this.accumulated += Math.abs(delta);
    if (this.accumulated >= 48) this.released = true;
    return { consume: true, delta: 0 };
  }
}
