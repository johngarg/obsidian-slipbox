type LayoutWindow = Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame" | "setTimeout" | "clearTimeout">;

/** Race a paint callback with a fallback for hidden or throttled windows. */
export class MeasuredLayoutScheduler {
  private ownerWindow: LayoutWindow | null = null;
  private frame: number | null = null;
  private timer: number | null = null;
  private generation = 0;

  constructor(private readonly layout: () => void) { }

  schedule(ownerWindow: LayoutWindow | null): void {
    if (ownerWindow === null) return;
    if (this.ownerWindow !== ownerWindow) this.cancel();
    if (this.frame !== null || this.timer !== null) return;
    this.ownerWindow = ownerWindow;
    const generation = this.generation;
    const flush = (): void => {
      if (generation === this.generation) this.flushNow();
    };
    this.frame = ownerWindow.requestAnimationFrame(flush);
    this.timer = ownerWindow.setTimeout(flush, 120);
  }

  flushNow(): void {
    this.cancel();
    this.layout();
  }

  cancel(): void {
    this.generation++;
    if (this.frame !== null) this.ownerWindow?.cancelAnimationFrame(this.frame);
    if (this.timer !== null) this.ownerWindow?.clearTimeout(this.timer);
    this.frame = null;
    this.timer = null;
    this.ownerWindow = null;
  }
}
