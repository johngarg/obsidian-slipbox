export type InlineEditOrigin = "deck" | "tray";
export type InlineEditPhase =
  | "editing"
  | "saving"
  | "conflict"
  | "closed";

export interface InlineEditCommitRequest {
  readonly path: string;
  readonly baseBody: string;
  readonly draft: string;
  readonly version: number;
  readonly final: boolean;
}

export type InlineEditCommitResult =
  | { readonly status: "saved" }
  | { readonly status: "conflict"; readonly message: string };

export interface InlineEditFailure {
  readonly kind: "conflict" | "write";
  readonly message: string;
  readonly error?: unknown;
}

export interface InlineEditSessionEnvironment {
  readonly debounceMs?: number;
  readonly commit: (
    request: InlineEditCommitRequest,
  ) => Promise<InlineEditCommitResult>;
  readonly flushOpenViews: (path: string) => Promise<void>;
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancelScheduled: (handle: unknown) => void;
  readonly reportFailure: (failure: InlineEditFailure) => void;
}

export interface InlineEditSessionSnapshot {
  readonly path: string;
  readonly origin: InlineEditOrigin;
  readonly baseBody: string;
  readonly draft: string;
  readonly version: number;
  readonly committedVersion: number;
  readonly phase: InlineEditPhase;
  readonly failure: InlineEditFailure | null;
  readonly conflictRetryable: boolean;
}

interface ActiveInlineEditFinalization {
  readonly reasons: Set<string>;
  readonly promise: Promise<boolean>;
}

/** Coalesces every caller that is finishing the same mounted editor. */
export class InlineEditFinalizationCoordinator {
  private active: ActiveInlineEditFinalization | null = null;

  finish(
    reason: string,
    finalize: (reasons: ReadonlySet<string>) => Promise<boolean>,
  ): Promise<boolean> {
    if (this.active !== null) {
      this.active.reasons.add(reason);
      return this.active.promise;
    }

    const reasons = new Set([reason]);
    const promise = finalize(reasons);
    const active = { reasons, promise };
    this.active = active;
    void promise.then(
      () => this.clear(active),
      () => this.clear(active),
    );
    return promise;
  }

  private clear(active: ActiveInlineEditFinalization): void {
    if (this.active === active) {
      this.active = null;
    }
  }
}

const DEFAULT_DEBOUNCE_MS = 500;

/** Exact-path ownership for independently mounted Slipbox views. */
export class InlineEditPathLock<Owner> {
  private readonly owners = new Map<string, Owner>();

  ownerAt(path: string): Owner | undefined {
    return this.owners.get(path);
  }

  acquire(path: string, owner: Owner): boolean {
    const existing = this.owners.get(path);
    if (existing !== undefined && existing !== owner) {
      return false;
    }
    this.owners.set(path, owner);
    return true;
  }

  release(path: string, owner: Owner): void {
    if (this.owners.get(path) === owner) {
      this.owners.delete(path);
    }
  }

  rename(oldPath: string, newPath: string, owner: Owner): boolean {
    if (this.owners.get(oldPath) !== owner) {
      return false;
    }
    const collision = this.owners.get(newPath);
    if (collision !== undefined && collision !== owner) {
      return false;
    }
    this.owners.delete(oldPath);
    this.owners.set(newPath, owner);
    return true;
  }

  ownerSet(): ReadonlySet<Owner> {
    return new Set(this.owners.values());
  }
}

/**
 * Serializes optimistic note-body writes for one mounted inline editor.
 * DOM mounting and Vault.process adaptation deliberately live outside this class.
 */
export class InlineEditSessionController {
  private baseBodyValue: string;
  private draftValue: string;
  private pathValue: string;
  private versionValue = 0;
  private committedVersionValue = 0;
  private phaseValue: InlineEditPhase = "editing";
  private failureValue: InlineEditFailure | null = null;
  private conflictRetryableValue = false;
  private debounceHandle: unknown = null;
  private writeTail: Promise<void> = Promise.resolve();
  private finishPromise: Promise<boolean> | null = null;

  constructor(
    path: string,
    readonly origin: InlineEditOrigin,
    body: string,
    private readonly environment: InlineEditSessionEnvironment,
  ) {
    this.pathValue = path;
    this.baseBodyValue = body;
    this.draftValue = body;
  }

  get snapshot(): InlineEditSessionSnapshot {
    return {
      path: this.pathValue,
      origin: this.origin,
      baseBody: this.baseBodyValue,
      draft: this.draftValue,
      version: this.versionValue,
      committedVersion: this.committedVersionValue,
      phase: this.phaseValue,
      failure: this.failureValue,
      conflictRetryable: this.conflictRetryableValue,
    };
  }

  updateDraft(draft: string): void {
    if (this.phaseValue === "closed") {
      return;
    }
    if (draft === this.draftValue) {
      return;
    }
    this.draftValue = draft;
    this.versionValue += 1;
    if (this.phaseValue !== "conflict") {
      this.phaseValue = "editing";
      this.failureValue = null;
      if (this.finishPromise === null) {
        this.scheduleDebouncedCommit();
      }
    }
  }

  renamePath(path: string): void {
    if (this.phaseValue !== "closed") {
      this.pathValue = path;
    }
  }

  markConflict(message: string, retryable = false): void {
    if (this.phaseValue === "closed") {
      return;
    }
    this.clearDebounce();
    const failure: InlineEditFailure = { kind: "conflict", message };
    this.phaseValue = "conflict";
    this.failureValue = failure;
    this.conflictRetryableValue = retryable;
    this.environment.reportFailure(failure);
  }

  finish(): Promise<boolean> {
    if (this.phaseValue === "closed") {
      return Promise.resolve(true);
    }
    if (this.finishPromise !== null) {
      return this.finishPromise;
    }
    this.clearDebounce();
    const pending = this.finishLatestDraft();
    this.finishPromise = pending;
    void pending.finally(() => {
      if (this.finishPromise === pending && this.phaseValue !== "closed") {
        this.finishPromise = null;
      }
    });
    return pending;
  }

  cancelDebounce(): void {
    this.clearDebounce();
  }

  private scheduleDebouncedCommit(): void {
    this.clearDebounce();
    this.debounceHandle = this.environment.schedule(() => {
      this.debounceHandle = null;
      void this.enqueueCommit(false);
    }, this.environment.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  private clearDebounce(): void {
    if (this.debounceHandle === null) {
      return;
    }
    this.environment.cancelScheduled(this.debounceHandle);
    this.debounceHandle = null;
  }

  private async finishLatestDraft(): Promise<boolean> {
    await this.writeTail;
    if (this.phaseValue === "conflict" && !this.conflictRetryableValue) {
      return false;
    }
    try {
      await this.environment.flushOpenViews(this.pathValue);
    } catch (error) {
      return this.handleWriteFailure("Could not save the open Markdown view.", error);
    }

    while (this.phaseValue !== "closed") {
      const targetVersion = this.versionValue;
      const saved = await this.enqueueCommit(true);
      if (!saved) {
        return false;
      }
      if (this.versionValue === targetVersion) {
        this.phaseValue = "closed";
        this.failureValue = null;
        return true;
      }
    }
    return true;
  }

  private enqueueCommit(final: boolean): Promise<boolean> {
    const version = this.versionValue;
    const draft = this.draftValue;
    const operation = this.writeTail.then(async () => {
      if (
        this.phaseValue === "closed" ||
        (this.phaseValue === "conflict" && (!final || !this.conflictRetryableValue))
      ) {
        return this.phaseValue === "closed";
      }
      this.phaseValue = "saving";
      let result: InlineEditCommitResult;
      try {
        result = await this.environment.commit({
          path: this.pathValue,
          baseBody: this.baseBodyValue,
          draft,
          version,
          final,
        });
      } catch (error) {
        return this.handleWriteFailure("Could not save the inline draft.", error);
      }

      if (result.status === "conflict") {
        this.markConflict(result.message, true);
        return false;
      }
      this.baseBodyValue = draft;
      this.committedVersionValue = Math.max(this.committedVersionValue, version);
      this.failureValue = null;
      this.conflictRetryableValue = false;
      this.phaseValue = "editing";
      return true;
    });
    this.writeTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private handleWriteFailure(message: string, error: unknown): false {
    const failure: InlineEditFailure = { kind: "write", message, error };
    this.phaseValue = "editing";
    this.failureValue = failure;
    this.conflictRetryableValue = false;
    this.environment.reportFailure(failure);
    return false;
  }
}

/** Await editing before performing one semantic action. */
export async function runAfterInlineEditing(
  finish: () => Promise<boolean>,
  action: () => void | Promise<void>,
): Promise<boolean> {
  if (!(await finish())) {
    return false;
  }
  await action();
  return true;
}
