export interface DeckInlineEditEnterState {
  readonly hasActiveCard: boolean;
  readonly editing: boolean;
  readonly starting: boolean;
  readonly filing: boolean;
  readonly pendingCommand: boolean;
}

export interface InlineAwareDeckActionState {
  readonly editing: boolean;
  readonly starting: boolean;
}

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

export function isDeckInlineEditEnter(
  event: KeyboardEvent,
  deck: HTMLElement,
  state: DeckInlineEditEnterState,
): boolean {
  return (
    event.target === deck &&
    event.key === "Enter" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    state.hasActiveCard &&
    !state.editing &&
    !state.starting &&
    !state.filing &&
    !state.pendingCommand
  );
}
