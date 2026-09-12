export interface DeckFrameEnvironment {
  request(callback: () => void): number;
  cancel(handle: number): void;
  /** Return true while an animation needs another frame. */
  flush(activeUiChanged: boolean): boolean;
}

/** Coalesce visual work while callers keep processing navigation in input order. */
export class DeckFrameScheduler {
  private handle: number | null = null;
  private activeUiChanged = false;
  private generation = 0;

  constructor(private readonly environment: DeckFrameEnvironment) {}

  request(activeUiChanged = false): void {
    this.activeUiChanged ||= activeUiChanged;
    if (this.handle !== null) return;
    const generation = this.generation;
    this.handle = this.environment.request(() => {
      if (generation !== this.generation) return;
      this.handle = null;
      const changed = this.activeUiChanged;
      this.activeUiChanged = false;
      const repeat = this.environment.flush(changed);
      if (repeat && generation === this.generation) this.request();
    });
  }

  cancel(): void {
    this.generation++;
    if (this.handle !== null) this.environment.cancel(this.handle);
    this.handle = null;
    this.activeUiChanged = false;
  }
}
