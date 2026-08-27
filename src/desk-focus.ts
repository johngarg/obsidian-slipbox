/**
 * True when focus entered a card presentation rather than the surrounding
 * pile or one of its pile-level controls.
 */
export function isDeskCardFocusTarget(target: Element | null): boolean {
  return target !== null && target.closest(".slipbox-desk-card") !== null;
}
