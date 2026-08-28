export interface MetadataCacheWaitEnvironment<File extends { readonly path: string }> {
  current(file: File, property: string): unknown;
  subscribe(callback: (file: File) => void): () => void;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
}

/** Wait for one frontmatter value without coupling workflows to Obsidian events. */
export class MetadataCacheWaiter<File extends { readonly path: string }> {
  constructor(
    private readonly environment: MetadataCacheWaitEnvironment<File>,
    private readonly timeoutMs = 1_000,
  ) {}

  waitFor(
    file: File,
    property: string,
    expected: unknown,
  ): Promise<boolean> {
    const ready = (): boolean =>
      this.environment.current(file, property) === expected;
    if (ready()) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      let unsubscribe: (() => void) | null = null;
      let timeout: unknown = null;
      let settled = false;
      const finish = (matched: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe?.();
        if (timeout !== null) {
          this.environment.cancelScheduled(timeout);
        }
        resolve(matched);
      };

      unsubscribe = this.environment.subscribe((changedFile) => {
        if (changedFile.path === file.path && ready()) {
          finish(true);
        }
      });
      timeout = this.environment.schedule(() => finish(ready()), this.timeoutMs);

      // Close the race between the first check and listener registration.
      if (ready()) {
        finish(true);
      }
    });
  }
}
