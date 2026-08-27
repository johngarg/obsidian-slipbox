export type IndexRefreshReason = "index" | "ordering";

export type AfterIndexReconcile = () => void;

export interface IndexRefreshRequest {
  readonly reason?: IndexRefreshReason;
  readonly afterReconcile?: AfterIndexReconcile;
}

export interface IndexRefreshBatch {
  readonly reason: IndexRefreshReason;
  readonly afterReconcile: readonly AfterIndexReconcile[];
}

export interface IndexRefreshCoordinatorEnvironment {
  readonly delayMs: number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
  run(batch: IndexRefreshBatch): Promise<void>;
  reportBackgroundError(error: unknown): void;
}

/** Debounce refresh events and serialize every full index rebuild. */
export class IndexRefreshCoordinator {
  private scheduledHandle: unknown = null;
  private pendingReason: IndexRefreshReason | null = null;
  private pendingAfterReconcile: AfterIndexReconcile[] = [];
  private inFlight: Promise<void> | null = null;
  private disposed = false;

  constructor(
    private readonly environment: IndexRefreshCoordinatorEnvironment,
  ) {}

  queue(request: IndexRefreshRequest = {}): void {
    if (this.disposed) {
      return;
    }
    this.enqueue(request);
    this.cancelTimer();
    if (this.inFlight !== null) {
      return;
    }
    this.scheduledHandle = this.environment.schedule(() => {
      this.scheduledHandle = null;
      void this.startDrain().catch((error: unknown) => {
        this.environment.reportBackgroundError(error);
      });
    }, this.environment.delayMs);
  }

  refresh(request: IndexRefreshRequest = {}): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.cancelTimer();
    this.enqueue(request);
    return this.startDrain();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
    this.pendingReason = null;
    this.pendingAfterReconcile = [];
  }

  private enqueue(request: IndexRefreshRequest): void {
    const reason = request.reason ?? "index";
    this.pendingReason =
      this.pendingReason === "ordering" || reason === "ordering"
        ? "ordering"
        : "index";
    if (request.afterReconcile !== undefined) {
      this.pendingAfterReconcile.push(request.afterReconcile);
    }
  }

  private cancelTimer(): void {
    if (this.scheduledHandle === null) {
      return;
    }
    this.environment.cancelScheduled(this.scheduledHandle);
    this.scheduledHandle = null;
  }

  private startDrain(): Promise<void> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    const inFlight = this.drain();
    this.inFlight = inFlight;
    void inFlight.then(
      () => this.finishDrain(inFlight),
      () => this.finishDrain(inFlight),
    );
    return inFlight;
  }

  private finishDrain(completed: Promise<void>): void {
    if (this.inFlight === completed) {
      this.inFlight = null;
    }
  }

  private async drain(): Promise<void> {
    while (!this.disposed && this.pendingReason !== null) {
      const batch: IndexRefreshBatch = {
        reason: this.pendingReason,
        afterReconcile: this.pendingAfterReconcile,
      };
      this.pendingReason = null;
      this.pendingAfterReconcile = [];
      await this.environment.run(batch);
    }
  }
}
