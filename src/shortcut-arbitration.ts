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
  private readonly handledActions = new WeakMap<TEvent, TAction>();

  observe(event: TEvent): void {
    this.observedEvent = event;
  }

  record(action: TAction, fallbackEvent?: TEvent): TEvent | undefined {
    const event = this.observedEvent ?? fallbackEvent;
    if (event !== undefined) {
      this.handledActions.set(event, action);
    }
    return event;
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
