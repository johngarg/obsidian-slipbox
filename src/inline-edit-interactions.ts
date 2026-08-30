export interface InlineAwareDeckActionState {
  readonly editing: boolean;
  readonly starting: boolean;
}

export interface DeckEscapeState {
  readonly editing: boolean;
  readonly pendingCommand: boolean;
  readonly filing: boolean;
}

export interface InlineEditPresentationCard {
  readonly path: string;
  readonly modified: number;
  readonly presentation: unknown;
}

export interface InlineEditPresentationState {
  readonly editingPath: string;
  readonly cards: readonly InlineEditPresentationCard[];
  readonly context: unknown;
}

export interface InlineEditRefreshGuard {
  readonly modified: number;
  readonly presentationFingerprint: string;
  readonly expiresAt: number;
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

/**
 * Compare everything that can require remounting the Slipbox surface while
 * deliberately ignoring body-only writes to the card being edited.
 */
export function inlineEditPresentationFingerprint(
  state: InlineEditPresentationState,
): string {
  return JSON.stringify({
    cards: state.cards.map((card) => ({
      path: card.path,
      modified: card.path === state.editingPath ? null : card.modified,
      presentation: card.presentation,
    })),
    context: state.context,
  });
}

/** Suppress late index echoes only while they describe the saved card revision. */
export function matchesInlineEditRefreshGuard(
  guard: InlineEditRefreshGuard | null,
  modified: number | null,
  presentationFingerprint: string,
  now = Date.now(),
): boolean {
  return guard !== null &&
    now <= guard.expiresAt &&
    modified === guard.modified &&
    presentationFingerprint === guard.presentationFingerprint;
}

/** Let card-header controls dispatch their own save-before-action sequence. */
export function shouldFinishInlineEditFromPointerDown(
  target: EventTarget | null,
  textarea: HTMLTextAreaElement,
  card: HTMLElement,
): boolean {
  const ElementConstructor = card.ownerDocument.defaultView?.Element;
  if (
    ElementConstructor === undefined ||
    !(target instanceof ElementConstructor)
  ) {
    return true;
  }
  if (textarea.contains(target)) {
    return false;
  }
  if (card.contains(target)) {
    if (target.closest(".slipbox-card-header-action") !== null) {
      return false;
    }
    if (
      target.closest(
        "a, button, input, select, [contenteditable='true']",
      ) === null
    ) {
      return false;
    }
  }
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

/** Keep every wheel gesture originating in the editor away from Deck navigation. */
export function shouldNavigateDeckFromWheel(
  event: WheelEvent,
  inlineEditor: HTMLTextAreaElement | null,
): boolean {
  const eventPath = event.composedPath();
  if (
    inlineEditor !== null &&
    eventPath.includes(inlineEditor)
  ) {
    return false;
  }
  if (eventPath.some((target) => {
    const classList = (target as { classList?: DOMTokenList }).classList;
    return classList?.contains("slipbox-local-branch-scroller") === true;
  })) {
    return false;
  }
  return Math.abs(event.deltaX) > Math.abs(event.deltaY);
}

const LOCAL_BRANCH_INTERACTIVE_SELECTOR = [
  ".slipbox-local-branch-node",
  ".slipbox-local-branch-gap",
  ".slipbox-local-branch-stub",
  ".slipbox-local-branch-header",
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='button']",
].join(", ");

/** Treat transparent, noninteractive Branch View space as Deck background. */
export function shouldBeginDeckPan(
  event: PointerEvent,
  stage: HTMLElement,
): boolean {
  if (event.button !== 0) {
    return false;
  }
  if (event.target === stage) {
    return true;
  }
  const ElementConstructor = stage.ownerDocument.defaultView?.Element;
  if (
    ElementConstructor === undefined ||
    !(event.target instanceof ElementConstructor) ||
    !stage.contains(event.target)
  ) {
    return false;
  }
  const target = event.target;
  const branchView = target.closest(".slipbox-local-branch-view");
  if (
    branchView === null ||
    !stage.contains(branchView) ||
    target.closest(LOCAL_BRANCH_INTERACTIVE_SELECTOR) !== null
  ) {
    return false;
  }
  const scroller = target.closest<HTMLElement>(
    ".slipbox-local-branch-scroller",
  );
  return scroller === null || !pointerIsInScrollbar(event, scroller);
}

function pointerIsInScrollbar(
  event: PointerEvent,
  element: HTMLElement,
): boolean {
  const horizontalHeight = element.offsetHeight - element.clientHeight;
  const verticalWidth = element.offsetWidth - element.clientWidth;
  if (horizontalHeight <= 0 && verticalWidth <= 0) {
    return false;
  }
  const bounds = element.getBoundingClientRect();
  const localX = event.clientX - bounds.left;
  const localY = event.clientY - bounds.top;
  return (
    horizontalHeight > 0 && localY >= element.clientHeight ||
    verticalWidth > 0 && localX >= element.clientWidth
  );
}
