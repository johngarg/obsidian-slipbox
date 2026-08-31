import { setCardTooltip } from "./card-tooltip.js";
import type {
  FilingSessionSnapshot,
  FilingSourceSurface,
} from "./filing-session.js";

export function filingEditorMatchesSource(
  sourcePath: string,
  sourceSurface: FilingSourceSurface,
  cardPath: string,
  cardSurface: FilingSourceSurface,
): boolean {
  return sourcePath === cardPath && sourceSurface === cardSurface;
}

export interface InlineFilingEditorActions {
  readonly showTooltips: boolean;
  readonly onInput: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onPreview: () => void;
  readonly onFocusChange: (focused: boolean) => void;
}

export interface InlineFilingEditorElements {
  readonly input: HTMLInputElement;
  readonly feedback: HTMLElement;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function createHtmlElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  return document.createElementNS(HTML_NAMESPACE, tag) as HTMLElementTagNameMap[K];
}

export function attachUnfiledAddressFiling(
  address: HTMLElement,
  beginFiling: () => void,
): void {
  // Desk cards and collapsed piles begin dragging on pointerdown. Keep the
  // pointer sequence on the address so the browser can deliver its dblclick.
  address.addEventListener("pointerdown", (event) => event.stopPropagation());
  address.addEventListener("click", (event) => event.stopPropagation());
  address.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    beginFiling();
  });
}

export function handleFilingEscape(
  event: KeyboardEvent,
  filingCanBeCancelled: boolean,
  cancelFiling: () => void,
): boolean {
  if (!filingCanBeCancelled || event.key !== "Escape") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  cancelFiling();
  return true;
}

export function shouldSuspendDeckShortcut(
  eventTarget: EventTarget | null,
  filingInputFocused: boolean,
): boolean {
  if (filingInputFocused) {
    return true;
  }
  if (eventTarget === null || typeof eventTarget !== "object") {
    return false;
  }
  const target = eventTarget as Partial<HTMLElement>;
  const tagName = target.tagName?.toLowerCase();
  if (target.classList?.contains("slipbox-deck-map") === true) {
    return true;
  }
  return tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    tagName === "a" ||
    target.isContentEditable === true;
}

export function eventTargetsDeck(
  eventTarget: EventTarget | null,
  deckRoot: HTMLElement,
): boolean {
  return eventTarget !== null &&
    typeof eventTarget === "object" &&
    "nodeType" in eventTarget &&
    deckRoot.contains(eventTarget as Node);
}

/**
 * Obsidian command-palette events can retain the palette input as lastEvent's
 * target while the Deck remains the active view. Only editable controls inside
 * this Deck should suppress one of its registered commands.
 */
export function shouldSuspendDeckCommand(
  eventTarget: EventTarget | null,
  filingInputFocused: boolean,
  deckRoot: HTMLElement,
): boolean {
  if (filingInputFocused) {
    return true;
  }
  if (!eventTargetsDeck(eventTarget, deckRoot)) {
    return false;
  }
  return shouldSuspendDeckShortcut(eventTarget, false);
}

export function renderInlineFilingEditor(
  addressSlot: HTMLElement,
  card: HTMLElement,
  state: FilingSessionSnapshot,
  actions: InlineFilingEditorActions,
): InlineFilingEditorElements {
  addressSlot.replaceChildren();
  addressSlot.classList.add("is-editing");
  const input = createHtmlElement(addressSlot.ownerDocument, "input");
  input.className = "slipbox-desk-filing-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Enter an address";
  setCardTooltip(input, "Card address", actions.showTooltips, {
    placement: "bottom",
    delay: 350,
  });
  addressSlot.append(input);

  const feedback = createHtmlElement(card.ownerDocument, "div");
  feedback.className = "slipbox-desk-filing-feedback";
  feedback.setAttribute("aria-live", "polite");
  card.append(feedback);

  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("focus", () => actions.onFocusChange(true));
  input.addEventListener("blur", () => actions.onFocusChange(false));
  input.addEventListener("input", () => actions.onInput(input.value));
  input.addEventListener("keydown", (event) => {
    if (handleFilingEscape(event, true, actions.onCancel)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      actions.onConfirm();
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      actions.onPreview();
    }
  });

  const elements = { input, feedback };
  updateInlineFilingEditor(elements, state);
  return elements;
}

export function updateInlineFilingEditor(
  elements: InlineFilingEditorElements,
  state: FilingSessionSnapshot,
): void {
  const { input, feedback } = elements;
  if (input.value !== state.value) {
    input.value = state.value;
  }
  input.disabled = state.phase === "confirming";
  input.setAttribute("aria-invalid", String(state.invalid));
  input.classList.toggle("is-invalid", state.invalid);

  feedback.replaceChildren();
  feedback.classList.toggle("is-invalid", state.invalid);
  if (state.message !== "") {
    const message = createHtmlElement(feedback.ownerDocument, "span");
    message.className = "slipbox-desk-filing-message";
    message.textContent = state.message;
    feedback.append(message);
  }
  if (state.address === null || state.duplicatePaths.length === 0) {
    return;
  }

  const details = createHtmlElement(feedback.ownerDocument, "details");
  details.className = "slipbox-desk-filing-duplicates";
  const summary = createHtmlElement(feedback.ownerDocument, "summary");
  summary.textContent = `${state.address} is used by ${state.duplicatePaths.length} card${
    state.duplicatePaths.length === 1 ? "" : "s"
  } · filename ordered`;
  details.append(summary);
  const paths = createHtmlElement(feedback.ownerDocument, "ul");
  for (const path of state.duplicatePaths) {
    const item = createHtmlElement(feedback.ownerDocument, "li");
    item.textContent = path;
    paths.append(item);
  }
  details.append(paths);
  feedback.append(details);
}
