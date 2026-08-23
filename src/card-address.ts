const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/** Accessible name for a card that has not been given an address yet. */
export const UNFILED_ADDRESS_LABEL = "Unfiled";

export interface CardAddressOptions {
  /** Surface class for the address element. */
  readonly cls: string;
  /** The filed address, or null for an unfiled card. */
  readonly address: string | null;
}

/**
 * Render a card address into `parent`.
 *
 * A filed card prints its address. An unfiled card gets an empty slot instead
 * of placeholder text: every trimmed, nonempty, single-line string is a valid
 * address, so any word printed there is also an address a card could genuinely
 * hold. The unfiled state is carried by the slot's styling rather than by text
 * no reader could tell apart from a real address.
 */
export function renderCardAddress(
  parent: HTMLElement,
  { cls, address }: CardAddressOptions,
): HTMLSpanElement {
  const element = parent.ownerDocument.createElementNS(HTML_NAMESPACE, "span");
  element.className = address === null ? `${cls} is-unfiled-slot` : cls;
  if (address !== null) {
    element.textContent = address;
  }
  parent.append(element);
  return element;
}
