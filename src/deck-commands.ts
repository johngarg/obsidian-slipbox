export interface AddressedDeckCard {
  readonly address: string;
  readonly path: string;
}

export type PendingDeckCommand =
  | { readonly kind: "idle" }
  | { readonly kind: "address" }
  | { readonly kind: "pile"; readonly digits: string };

export type PendingDeckCommandStep =
  | { readonly consumed: false; readonly state: PendingDeckCommand }
  | { readonly consumed: true; readonly state: PendingDeckCommand }
  | {
      readonly consumed: true;
      readonly state: PendingDeckCommand;
      readonly completion:
        | { readonly kind: "address"; readonly initial: string }
        | { readonly kind: "pile"; readonly digits: string };
    }
  | { readonly consumed: true; readonly state: PendingDeckCommand; readonly cancelled: true };

export const IDLE_DECK_COMMAND: PendingDeckCommand = { kind: "idle" };

const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"]);

export interface PendingDeckCommandKeyCapture {
  readonly isPending: () => boolean;
  readonly isActive: () => boolean;
  readonly shouldIgnore?: (event: KeyboardEvent) => boolean;
  readonly handle: (event: KeyboardEvent) => void;
}

/** Capture continuation keys even when Obsidian leaves focus outside the Deck DOM. */
export function installPendingDeckCommandKeyCapture(
  target: Document,
  capture: PendingDeckCommandKeyCapture,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (
      capture.isPending() &&
      capture.isActive() &&
      capture.shouldIgnore?.(event) !== true
    ) {
      capture.handle(event);
    }
  };
  target.addEventListener("keydown", listener, { capture: true });
  return () => target.removeEventListener("keydown", listener, { capture: true });
}

export function firstUnicodeCharacter(value: string): string | null {
  return Array.from(value)[0] ?? null;
}

export function findAddressInitialIndex(
  cards: readonly AddressedDeckCard[],
  initial: string,
): number | null {
  const targetInitial = firstUnicodeCharacter(initial);
  if (targetInitial === null) {
    return null;
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (card !== undefined && firstUnicodeCharacter(card.address) === targetInitial) {
      return index;
    }
  }
  return null;
}

export function startAddressCommand(): PendingDeckCommand {
  return { kind: "address" };
}

export function startPileCommand(): PendingDeckCommand {
  return { kind: "pile", digits: "" };
}

export function advancePendingDeckCommand(
  state: PendingDeckCommand,
  key: string,
): PendingDeckCommandStep {
  if (state.kind === "idle") {
    return { consumed: false, state };
  }
  if (MODIFIER_KEYS.has(key)) {
    return { consumed: false, state };
  }
  if (key === "Escape") {
    return { consumed: true, state: IDLE_DECK_COMMAND, cancelled: true };
  }

  if (state.kind === "address") {
    const initial = firstUnicodeCharacter(key);
    if (initial === null || Array.from(key).length !== 1) {
      return { consumed: true, state };
    }
    return {
      consumed: true,
      state: IDLE_DECK_COMMAND,
      completion: { kind: "address", initial },
    };
  }

  if (/^[0-9]$/.test(key)) {
    return {
      consumed: true,
      state: { kind: "pile", digits: `${state.digits}${key}` },
    };
  }
  if (key === "Backspace") {
    return {
      consumed: true,
      state: { kind: "pile", digits: state.digits.slice(0, -1) },
    };
  }
  if (key === "Enter") {
    return {
      consumed: true,
      state,
      completion: { kind: "pile", digits: state.digits },
    };
  }
  return { consumed: true, state };
}
