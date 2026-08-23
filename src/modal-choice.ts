/** Deliver a modal's outcome exactly once, whatever order its callbacks run in. */
export interface ModalChoice<T> {
  /** Record a chosen value. A choice always wins over a cancellation. */
  readonly choose: (value: T) => void;
  /** Record that the modal closed. Deferred, so a later choice still wins. */
  readonly cancel: () => void;
}

/**
 * Reconcile a suggester's choose and close callbacks into one resolution.
 *
 * Obsidian does not guarantee that a chosen suggestion is reported before its
 * modal closes, so a naive "resolve null unless already settled" close handler
 * discards the choice whenever close runs first. Cancellation is therefore
 * scheduled rather than applied immediately, letting a choice that arrives
 * later in the same task settle ahead of it.
 *
 * Resolution is always scheduled, never synchronous, because callers write to
 * an editor and an edit made while the modal is still tearing down does not
 * reach the document.
 */
export function modalChoice<T>(
  resolve: (value: T | null) => void,
  schedule: (task: () => void) => void,
): ModalChoice<T> {
  let settled = false;

  const settleWith = (value: T | null): void => {
    if (settled) {
      return;
    }
    settled = true;
    schedule(() => resolve(value));
  };

  return {
    choose: (value: T): void => settleWith(value),
    cancel: (): void => schedule(() => settleWith(null)),
  };
}
