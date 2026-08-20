export interface NavigationHistorySnapshot<T> {
  readonly entries: readonly T[];
  readonly index: number;
}

/**
 * Session-local browser history.
 *
 * Sequential Deck movement replaces the current location; explicit jumps add
 * a new location and discard any forward branch.
 */
export class NavigationHistory<T> {
  private entries: T[] = [];
  private index = -1;

  constructor(
    initial?: T,
    private readonly equals: (left: T, right: T) => boolean = Object.is,
  ) {
    if (initial !== undefined) {
      this.entries = [initial];
      this.index = 0;
    }
  }

  current(): T | undefined {
    return this.entries[this.index];
  }

  canBack(): boolean {
    return this.index > 0;
  }

  canForward(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  /** Set a new browsing session without retaining earlier locations. */
  reset(location?: T): void {
    this.entries = location === undefined ? [] : [location];
    this.index = location === undefined ? -1 : 0;
  }

  /**
   * Track ordinary physical movement without adding a Back destination.
   * The resulting card becomes the source if the next action is a jump.
   */
  replaceCurrent(location: T): void {
    if (this.index < 0) {
      this.entries = [location];
      this.index = 0;
      return;
    }
    this.entries[this.index] = location;
  }

  /** Record an explicit jump with browser-style forward-branch replacement. */
  jump(location: T): void {
    const current = this.current();
    if (current !== undefined && this.equals(current, location)) {
      return;
    }
    const retained = this.entries.slice(0, this.index + 1);
    retained.push(location);
    this.entries = retained;
    this.index = retained.length - 1;
  }

  back(): T | undefined {
    if (!this.canBack()) {
      return undefined;
    }
    this.index -= 1;
    return this.current();
  }

  forward(): T | undefined {
    if (!this.canForward()) {
      return undefined;
    }
    this.index += 1;
    return this.current();
  }

  /** Rewrite or remove stored locations after file and folder path changes. */
  transform(transformLocation: (location: T) => T | undefined): void {
    const transformed: T[] = [];
    let transformedIndex = -1;
    this.entries.forEach((entry, index) => {
      const next = transformLocation(entry);
      if (next === undefined) {
        return;
      }
      const previous = transformed[transformed.length - 1];
      if (previous === undefined || !this.equals(previous, next)) {
        transformed.push(next);
      }
      if (index <= this.index) {
        transformedIndex = transformed.length - 1;
      }
    });
    this.entries = transformed;
    this.index = transformedIndex;
  }

  snapshot(): NavigationHistorySnapshot<T> {
    return { entries: [...this.entries], index: this.index };
  }
}
