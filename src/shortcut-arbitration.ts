export type ShortcutArbitrationResult =
  | "command"
  | "conflict"
  | "slipbox";

export type ShortcutClaim =
  | "same-slipbox-command"
  | "other-command"
  | "unclaimed";

export class ShortcutCommandTracker<TEvent extends object, TAction> {
  private observedEvent: TEvent | undefined;
  private pendingDispatch: {
    readonly action: TAction;
    readonly fallbackEvent: TEvent | undefined;
  } | undefined;
  private readonly handledActions = new WeakMap<TEvent, TAction>();

  observe(event: TEvent): void {
    this.observedEvent = event;
    const pending = this.pendingDispatch;
    if (pending === undefined) {
      return;
    }
    this.pendingDispatch = undefined;
    if (pending.fallbackEvent !== undefined) {
      this.handledActions.delete(pending.fallbackEvent);
    }
    this.handledActions.set(event, pending.action);
  }

  record(action: TAction, fallbackEvent?: TEvent): TEvent | undefined {
    if (this.observedEvent !== undefined) {
      this.handledActions.set(this.observedEvent, action);
      return this.observedEvent;
    }
    const pending = { action, fallbackEvent };
    this.pendingDispatch = pending;
    if (fallbackEvent !== undefined) {
      this.handledActions.set(fallbackEvent, action);
    }
    queueMicrotask(() => {
      if (this.pendingDispatch === pending) {
        this.pendingDispatch = undefined;
      }
    });
    return fallbackEvent;
  }

  take(event: TEvent): TAction | undefined {
    const action = this.handledActions.get(event);
    this.handledActions.delete(event);
    if (this.observedEvent === event) {
      this.observedEvent = undefined;
    }
    return action;
  }
}

export function classifyShortcutClaim(
  defaultPrevented: boolean,
  configuredAction: string,
  handledSlipboxAction?: string,
): ShortcutClaim {
  if (handledSlipboxAction === configuredAction) {
    return "same-slipbox-command";
  }
  if (defaultPrevented || handledSlipboxAction !== undefined) {
    return "other-command";
  }
  return "unclaimed";
}

/**
 * Decide the winner after Obsidian's keymap has had an opportunity to handle
 * a configured Slipbox shortcut. A customized Obsidian command always wins.
 */
export function arbitrateShortcut(
  claim: ShortcutClaim,
  runSlipboxShortcut: () => void,
  reportConflict: () => void,
): ShortcutArbitrationResult {
  if (claim === "same-slipbox-command") {
    return "command";
  }
  if (claim === "other-command") {
    reportConflict();
    return "conflict";
  }
  runSlipboxShortcut();
  return "slipbox";
}
