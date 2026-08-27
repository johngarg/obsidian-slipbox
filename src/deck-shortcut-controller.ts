import {
  IDLE_DECK_COMMAND,
  advancePendingDeckCommand,
  installPendingDeckCommandKeyCapture,
  startAddressCommand,
  startPileCommand,
  type PendingDeckCommand,
  type PendingDeckCommandCompletion,
} from "./deck-commands.js";
import {
  eventTargetsDeck,
  shouldSuspendDeckCommand,
  shouldSuspendDeckShortcut,
} from "./filing-editor.js";
import {
  DECK_ACTION_DEFINITIONS,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingSignature,
  type DeckAction,
  type DeckKeyBinding,
  type SlipboxActionDefinition,
  type SlipboxSettings,
} from "./settings.js";
import {
  arbitrateShortcut,
  classifyShortcutClaim,
  installEarlyShortcutObserver,
  ShortcutCommandTracker,
} from "./shortcut-arbitration.js";

const COMMAND_FEEDBACK_DURATION_MS = 1_800;
const COMMAND_DISPATCH_KEYUP_TIMEOUT_MS = 2_000;
const CONFLICT_NOTICE_THROTTLE_MS = 5_000;
const CONFLICT_NOTICE_DURATION_MS = 6_000;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const PENDING_COMMAND_ACTIONS = new Set<DeckAction>([
  "find-address-first",
  "pull-into-pile",
]);

export type PendingDeckCommandCompletionResult =
  | { readonly kind: "complete"; readonly feedback?: string }
  | { readonly kind: "continue"; readonly feedback: string };

export interface DeckShortcutEnvironment {
  readonly root: HTMLElement;
  readonly isMacOS: boolean;
  readonly isActive: () => boolean;
  readonly isFilingInputFocused: () => boolean;
  readonly bindings: () => SlipboxSettings["deckKeybindings"];
  readonly lastEvent: () => Event | null;
  readonly canRun: (action: DeckAction) => boolean;
  readonly run: (action: DeckAction) => boolean;
  readonly completePending: (
    completion: PendingDeckCommandCompletion,
  ) => PendingDeckCommandCompletionResult;
  readonly showNotice: (message: string, duration: number) => void;
  readonly now?: () => number;
}

function keyboardEvent(event: Event | null): KeyboardEvent | undefined {
  return event !== null && "key" in event
    ? event as KeyboardEvent
    : undefined;
}

export class DeckShortcutController {
  private suspended = false;
  private connected = false;
  private readonly commandTracker =
    new ShortcutCommandTracker<KeyboardEvent, DeckAction>();
  private commandActionAwaitingKeyup: {
    readonly action: DeckAction;
    readonly timestamp: number;
  } | null = null;
  private readonly conflictNoticeTimes = new Map<string, number>();
  private pendingCommand: PendingDeckCommand = IDLE_DECK_COMMAND;
  private pendingCommandStartEvent: KeyboardEvent | null = null;
  private statusEl: HTMLElement | null = null;
  private feedback = "";
  private feedbackTimer: number | null = null;

  constructor(private readonly environment: DeckShortcutEnvironment) {}

  get hasPendingCommand(): boolean {
    return this.pendingCommand.kind !== "idle";
  }

  connect(): () => void {
    if (this.connected) {
      return () => undefined;
    }
    this.connected = true;
    const removers: Array<() => void> = [];
    const ownerWindow = this.environment.root.ownerDocument.defaultView;
    if (ownerWindow !== null) {
      // Window capture must observe the event before Obsidian can consume it
      // from a document-level keymap listener.
      removers.push(installEarlyShortcutObserver(
        ownerWindow,
        (event) => this.deferConfiguredShortcut(event),
      ));
      const keyup = (event: KeyboardEvent): void => {
        this.reportCommandConflictOnKeyup(event);
      };
      ownerWindow.addEventListener("keyup", keyup, { capture: true });
      removers.push(() => ownerWindow.removeEventListener("keyup", keyup, {
        capture: true,
      }));
    }
    removers.push(installPendingDeckCommandKeyCapture(
      this.environment.root.ownerDocument,
      {
        isPending: () => this.hasPendingCommand,
        isActive: this.environment.isActive,
        shouldIgnore: (event) => {
          if (event !== this.pendingCommandStartEvent) {
            return false;
          }
          this.pendingCommandStartEvent = null;
          return true;
        },
        handle: (event) => {
          this.handlePendingContinuation(event);
        },
      },
    ));

    let disconnected = false;
    return () => {
      if (disconnected) {
        return;
      }
      disconnected = true;
      this.connected = false;
      for (const remove of removers) {
        remove();
      }
      this.clearPendingCommand();
      this.commandActionAwaitingKeyup = null;
      this.statusEl = null;
    };
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) {
      return;
    }
    if (suspended) {
      this.clearPendingCommand();
    }
    this.suspended = suspended;
  }

  canRunCommand(action: DeckAction): boolean {
    const event = keyboardEvent(this.environment.lastEvent());
    if (
      this.suspended ||
      (
        event !== undefined &&
        shouldSuspendDeckCommand(
          event.target,
          this.environment.isFilingInputFocused(),
          this.environment.root,
        )
      )
    ) {
      return false;
    }
    return this.environment.canRun(action);
  }

  runCommand(action: DeckAction): boolean {
    const lastEvent = keyboardEvent(this.environment.lastEvent());
    const deckEvent = lastEvent !== undefined && eventTargetsDeck(
      lastEvent.target,
      this.environment.root,
    )
      ? lastEvent
      : undefined;
    const commandEvent = this.commandTracker.record(action, deckEvent);
    const deckCommandEvent = commandEvent !== undefined && eventTargetsDeck(
      commandEvent.target,
      this.environment.root,
    )
      ? commandEvent
      : undefined;
    this.commandActionAwaitingKeyup = deckCommandEvent === undefined
      ? null
      : { action, timestamp: this.now() };

    if (
      deckCommandEvent !== undefined &&
      !shouldSuspendDeckShortcut(
        deckCommandEvent.target,
        this.environment.isFilingInputFocused(),
      )
    ) {
      const configuredShortcut = this.configuredShortcut(deckCommandEvent);
      if (
        configuredShortcut !== null &&
        configuredShortcut.definition.id !== action
      ) {
        this.reportConflict(formatKeyBinding(configuredShortcut.binding));
      }
    }

    const ran = this.environment.run(action);
    if (
      ran &&
      PENDING_COMMAND_ACTIONS.has(action) &&
      commandEvent !== undefined
    ) {
      this.pendingCommandStartEvent = commandEvent;
    }
    return ran;
  }

  beginAddressCommand(): void {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startAddressCommand();
    this.updateStatus();
  }

  beginPileCommand(): void {
    this.pendingCommandStartEvent = null;
    this.clearPendingCommand();
    this.pendingCommand = startPileCommand();
    this.updateStatus();
  }

  cancelPendingCommand(): void {
    if (!this.hasPendingCommand) {
      return;
    }
    this.pendingCommandStartEvent = null;
    this.pendingCommand = IDLE_DECK_COMMAND;
    this.feedback = "";
    this.showFeedback("Command cancelled.");
  }

  renderStatus(container: HTMLElement): void {
    const status = container.ownerDocument.createElementNS(
      HTML_NAMESPACE,
      "div",
    );
    status.className = "slipbox-pending-command-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    container.append(status);
    this.statusEl = status;
    this.updateStatus();
  }

  private deferConfiguredShortcut(event: KeyboardEvent): void {
    if (
      this.suspended ||
      this.hasPendingCommand ||
      !this.environment.isActive() ||
      shouldSuspendDeckShortcut(
        event.target,
        this.environment.isFilingInputFocused(),
      )
    ) {
      return;
    }
    const shortcut = this.configuredShortcut(event);
    if (shortcut !== null) {
      this.deferActionKey(event, shortcut.definition, shortcut.binding);
    }
  }

  private configuredShortcut(event: KeyboardEvent): {
    readonly definition: SlipboxActionDefinition;
    readonly binding: DeckKeyBinding;
  } | null {
    const signature = keyBindingSignature(keyBindingFromKeyboardEvent(
      event,
      this.environment.isMacOS,
    ));
    const bindings = this.environment.bindings();
    for (const definition of DECK_ACTION_DEFINITIONS) {
      const configured = bindings[definition.id].find(
        (binding) => keyBindingSignature(binding) === signature,
      );
      if (configured !== undefined) {
        return { definition, binding: configured };
      }
    }
    return null;
  }

  private deferActionKey(
    event: KeyboardEvent,
    definition: SlipboxActionDefinition,
    binding: DeckKeyBinding,
  ): void {
    if (
      this.hasPendingCommand ||
      !this.environment.isActive() ||
      shouldSuspendDeckShortcut(
        event.target,
        this.environment.isFilingInputFocused(),
      )
    ) {
      return;
    }
    this.commandTracker.observe(event);
    // Obsidian gets the rest of the keydown before the local fallback decides
    // whether the event was left unclaimed.
    queueMicrotask(() => {
      const commandAction = this.commandTracker.take(event);
      if (!this.environment.isActive()) {
        return;
      }
      const claim = classifyShortcutClaim(
        event.defaultPrevented,
        definition.id,
        commandAction,
      );
      arbitrateShortcut(
        claim,
        () => this.handleActionKey(event, definition),
        () => this.reportConflict(formatKeyBinding(binding)),
      );
    });
  }

  private handleActionKey(
    event: KeyboardEvent,
    definition: SlipboxActionDefinition,
  ): void {
    if (
      this.hasPendingCommand ||
      shouldSuspendDeckShortcut(
        event.target,
        this.environment.isFilingInputFocused(),
      ) ||
      !this.environment.canRun(definition.id)
    ) {
      return;
    }
    event.preventDefault();
    if (event.repeat && !definition.repeatable) {
      return;
    }
    const ran = this.environment.run(definition.id);
    if (
      ran &&
      !event.repeat &&
      PENDING_COMMAND_ACTIONS.has(definition.id)
    ) {
      this.pendingCommandStartEvent = event;
    }
  }

  private reportCommandConflictOnKeyup(event: KeyboardEvent): void {
    const dispatched = this.commandActionAwaitingKeyup;
    if (dispatched === null) {
      return;
    }
    if (this.now() - dispatched.timestamp > COMMAND_DISPATCH_KEYUP_TIMEOUT_MS) {
      this.commandActionAwaitingKeyup = null;
      return;
    }
    const configuredShortcut = this.configuredShortcut(event);
    if (configuredShortcut === null) {
      return;
    }
    this.commandActionAwaitingKeyup = null;
    if (
      shouldSuspendDeckShortcut(
        event.target,
        this.environment.isFilingInputFocused(),
      ) ||
      configuredShortcut.definition.id === dispatched.action
    ) {
      return;
    }
    this.reportConflict(formatKeyBinding(configuredShortcut.binding));
  }

  private reportConflict(shortcut: string): void {
    const message = `${shortcut} is already handled by an Obsidian hotkey; Slipbox Desk left it unchanged.`;
    this.showFeedback(message);
    const now = this.now();
    const lastNotice = this.conflictNoticeTimes.get(shortcut) ?? 0;
    if (now - lastNotice < CONFLICT_NOTICE_THROTTLE_MS) {
      return;
    }
    this.conflictNoticeTimes.set(shortcut, now);
    this.environment.showNotice(
      `Slipbox Desk shortcut conflict: ${message}`,
      CONFLICT_NOTICE_DURATION_MS,
    );
  }

  private handlePendingContinuation(event: KeyboardEvent): boolean {
    if (event === this.pendingCommandStartEvent) {
      this.pendingCommandStartEvent = null;
      return false;
    }
    this.pendingCommandStartEvent = null;
    if (!this.hasPendingCommand) {
      return false;
    }
    if (shouldSuspendDeckShortcut(
      event.target,
      this.environment.isFilingInputFocused(),
    )) {
      this.clearPendingCommand();
      return false;
    }
    const step = advancePendingDeckCommand(this.pendingCommand, event.key);
    if (!step.consumed) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.pendingCommand = step.state;
    this.feedback = "";
    this.updateStatus();

    if ("cancelled" in step) {
      this.showFeedback("Command cancelled.");
      return true;
    }
    if (!("completion" in step)) {
      return true;
    }

    const result = this.environment.completePending(step.completion);
    if (result.kind === "continue") {
      this.feedback = result.feedback;
      this.updateStatus();
      return true;
    }
    this.clearPendingCommand();
    if (result.feedback !== undefined) {
      this.showFeedback(result.feedback);
    }
    return true;
  }

  private clearPendingCommand(): void {
    this.clearFeedbackTimer();
    this.pendingCommand = IDLE_DECK_COMMAND;
    this.pendingCommandStartEvent = null;
    this.feedback = "";
    this.updateStatus();
  }

  private showFeedback(message: string): void {
    this.clearFeedbackTimer();
    this.feedback = message;
    this.updateStatus();
    const ownerWindow = this.environment.root.ownerDocument.defaultView;
    if (ownerWindow === null) {
      return;
    }
    this.feedbackTimer = ownerWindow.setTimeout(() => {
      this.feedbackTimer = null;
      this.feedback = "";
      this.updateStatus();
    }, COMMAND_FEEDBACK_DURATION_MS);
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer === null) {
      return;
    }
    this.environment.root.ownerDocument.defaultView?.clearTimeout(
      this.feedbackTimer,
    );
    this.feedbackTimer = null;
  }

  private updateStatus(): void {
    const status = this.statusEl;
    if (status === null) {
      return;
    }
    let instruction = "";
    if (this.pendingCommand.kind === "address") {
      instruction = "Find from start: type an address initial · Esc to cancel";
    } else if (this.pendingCommand.kind === "pile") {
      const digits = this.pendingCommand.digits === ""
        ? "…"
        : this.pendingCommand.digits;
      instruction = `Pile number: ${digits} · Enter to confirm · Esc to cancel`;
    }
    const text = this.feedback || instruction;
    status.hidden = text === "";
    status.textContent = text;
  }

  private now(): number {
    return this.environment.now?.() ?? Date.now();
  }
}
