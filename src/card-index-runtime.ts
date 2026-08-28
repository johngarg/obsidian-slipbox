import { CardIndex, type VaultCardIndex } from "./card-index.js";
import type { CardIndexConfig } from "./card-index-config.js";
import {
  IndexRefreshCoordinator,
  type IndexRefreshBatch,
  type IndexRefreshRequest,
} from "./index-refresh-coordinator.js";

export interface CardIndexRuntimeEnvironment {
  reconcile(snapshot: VaultCardIndex): void;
  publish(reason: IndexRefreshBatch["reason"]): Promise<void>;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
  reportBackgroundError(error: unknown): void;
}

/** Own the only publication path for the shared CardIndex snapshot. */
export class CardIndexRuntime {
  private queueSuppressionDepth = 0;
  private readonly coordinator: IndexRefreshCoordinator;

  constructor(
    readonly index: CardIndex,
    environment: CardIndexRuntimeEnvironment,
  ) {
    this.coordinator = new IndexRefreshCoordinator({
      delayMs: 80,
      schedule: (callback, delayMs) => environment.schedule(callback, delayMs),
      cancelScheduled: (handle) => environment.cancelScheduled(handle),
      run: async (batch) => {
        const snapshot = this.index.buildSnapshot();
        this.index.publish(snapshot);
        environment.reconcile(snapshot);
        for (const afterReconcile of batch.afterReconcile) {
          afterReconcile(snapshot);
        }
        await environment.publish(batch.reason);
      },
      reportBackgroundError: (error) => environment.reportBackgroundError(error),
    });
  }

  configure(config: CardIndexConfig): void {
    this.index.configure(config);
  }

  queue(request: IndexRefreshRequest = {}): void {
    if (this.queueSuppressionDepth === 0) {
      this.coordinator.queue(request);
    }
  }

  refresh(request: IndexRefreshRequest = {}): Promise<void> {
    return this.coordinator.refresh(request);
  }

  async suppressQueuedRefresh<T>(operation: () => Promise<T>): Promise<T> {
    this.queueSuppressionDepth += 1;
    try {
      return await operation();
    } finally {
      this.queueSuppressionDepth -= 1;
    }
  }

  dispose(): void {
    this.coordinator.dispose();
  }
}
