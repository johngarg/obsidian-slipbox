export interface DeckBookmarkTab {
  readonly direction: "before" | "after";
  readonly path: string;
  readonly address: string;
  readonly vertical: boolean;
  readonly showTooltips: boolean;
}

/** Own stable edge buttons, replacing them only when their target or presentation changes. */
export class DeckBookmarkTabs {
  private stage: HTMLElement | null = null;
  private entries = new Map<DeckBookmarkTab["direction"], { key: string; element: HTMLElement }>();

  constructor(private readonly cleanup: (element: HTMLElement) => void) {}

  reconcile(
    stage: HTMLElement,
    targets: readonly DeckBookmarkTab[],
    create: (target: DeckBookmarkTab) => HTMLElement,
  ): void {
    if (this.stage !== stage) {
      this.clear();
      this.stage = stage;
    }
    const wanted = new Set(targets.map((target) => target.direction));
    for (const [direction, entry] of this.entries) {
      if (!wanted.has(direction)) {
        this.cleanup(entry.element);
        entry.element.remove();
        this.entries.delete(direction);
      }
    }
    for (const target of targets) {
      const key = JSON.stringify(target);
      const previous = this.entries.get(target.direction);
      if (previous?.key === key && previous.element.parentElement === stage) continue;
      if (previous !== undefined) {
        this.cleanup(previous.element);
        previous.element.remove();
      }
      this.entries.set(target.direction, { key, element: create(target) });
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.cleanup(entry.element);
      entry.element.remove();
    }
    this.entries.clear();
    this.stage = null;
  }
}
