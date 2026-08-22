export interface InlineAwareDeckActionState {
  readonly editing: boolean;
  readonly starting: boolean;
}

export interface DeckEscapeState {
  readonly editing: boolean;
  readonly pendingCommand: boolean;
  readonly filing: boolean;
}

export type DeckEscapeAction =
  | "finish-editing"
  | "cancel-pending-command"
  | "cancel-filing"
  | "contain";

/** Preserve synchronous Deck actions unless a mounted editor must be flushed. */
export function dispatchInlineAwareDeckAction(
  state: InlineAwareDeckActionState,
  runAfterEditing: (action: () => void) => Promise<boolean>,
  action: () => void,
): boolean {
  if (state.starting) {
    return false;
  }
  if (!state.editing) {
    action();
    return true;
  }
  void runAfterEditing(action);
  return true;
}

/** Resolve Escape within the active Slipbox view before the parent Scope sees it. */
export function resolveDeckEscapeAction(
  event: KeyboardEvent,
  state: DeckEscapeState,
): DeckEscapeAction | null {
  if (event.key !== "Escape") {
    return null;
  }
  if (state.editing) {
    return "finish-editing";
  }
  if (state.pendingCommand) {
    return "cancel-pending-command";
  }
  if (state.filing) {
    return "cancel-filing";
  }
  return "contain";
}

/** Keep an owned Escape event from reaching Obsidian's parent view navigation. */
export function consumeDeckEscape(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function isInlineEditBodyTarget(
  target: EventTarget | null,
  bodySurface: HTMLElement,
): boolean {
  const ElementConstructor = bodySurface.ownerDocument.defaultView?.Element;
  if (
    ElementConstructor === undefined ||
    !(target instanceof ElementConstructor) ||
    !bodySurface.contains(target)
  ) {
    return false;
  }
  return target.closest(
    "a, button, input, textarea, select, [contenteditable='true'], " +
    ".slipbox-card-address-row, .slipbox-card-footer",
  ) === null;
}

/** Keep every wheel gesture originating in the editor away from Deck navigation. */
export function shouldNavigateDeckFromWheel(
  event: WheelEvent,
  inlineEditor: HTMLTextAreaElement | null,
): boolean {
  if (
    inlineEditor !== null &&
    event.composedPath().includes(inlineEditor)
  ) {
    return false;
  }
  return Math.abs(event.deltaX) > Math.abs(event.deltaY);
}
