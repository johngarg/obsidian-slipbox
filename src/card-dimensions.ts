export interface CardDimensions {
  readonly width: number;
  readonly height: number;
}

export interface CardDimensionsEnvironment {
  requestLayout(): void;
  changed(): void;
  /** Test seam; the browser implementation measures only the sizing probe. */
  measure?: (element: HTMLElement) => CardDimensions | null;
}

/** Resolve CSS sizes outside the motion loop, independently of mounted notes. */
export class CardDimensionsController {
  private value: CardDimensions;
  private probe: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private dirty = false;
  private generation = 0;

  constructor(fallback: CardDimensions, private readonly environment: CardDimensionsEnvironment) {
    this.value = Object.freeze({ ...fallback });
  }

  get snapshot(): CardDimensions {
    return this.value;
  }

  mount(stage: HTMLElement): void {
    this.dispose();
    const probe = stage.createDiv();
    probe.className = "slipbox-deck-size-probe";
    probe.setAttribute("aria-hidden", "true");
    this.probe = probe;
    const generation = this.generation;
    const ownerWindow = stage.ownerDocument.defaultView;
    if (ownerWindow !== null) {
      this.observer = new ownerWindow.ResizeObserver(() => {
        if (generation === this.generation) this.invalidate();
      });
      this.observer.observe(probe, { box: "border-box" });
    }
    this.dirty = true;
    this.flush();
  }

  invalidate(): void {
    if (this.probe === null || this.dirty) return;
    this.dirty = true;
    this.environment.requestLayout();
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const probe = this.probe;
    if (probe === null || !probe.isConnected) return;
    const measured = (this.environment.measure ?? measureProbe)(probe);
    if (measured === null || !Number.isFinite(measured.width) || !Number.isFinite(measured.height) ||
      measured.width <= 0 || measured.height <= 0) return;
    if (measured.width === this.value.width && measured.height === this.value.height) return;
    this.value = Object.freeze({ width: measured.width, height: measured.height });
    this.environment.changed();
  }

  dispose(): void {
    this.generation++;
    this.observer?.disconnect();
    this.observer = null;
    this.probe?.remove();
    this.probe = null;
    this.dirty = false;
  }
}

function measureProbe(probe: HTMLElement): CardDimensions | null {
  const ownerWindow = probe.ownerDocument.defaultView;
  if (ownerWindow === null || probe.getClientRects().length === 0) return null;
  // Computed border-box lengths retain fractions without ancestor transforms.
  const style = ownerWindow.getComputedStyle(probe);
  return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
}
