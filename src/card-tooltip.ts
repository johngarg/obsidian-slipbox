import type { TooltipOptions } from "obsidian";

let accessibleLabelSequence = 0;

const labelIdFor = (element: HTMLElement): string => {
  const existing = element.dataset.slipboxAccessibleLabelId;
  if (existing !== undefined) {
    return existing;
  }
  const id = `slipbox-accessible-label-${++accessibleLabelSequence}`;
  element.dataset.slipboxAccessibleLabelId = id;
  return id;
};

const removeHiddenLabel = (element: HTMLElement): void => {
  const id = element.dataset.slipboxAccessibleLabelId;
  if (id !== undefined) {
    element.ownerDocument.getElementById(id)?.remove();
    delete element.dataset.slipboxAccessibleLabelId;
  }
  element.removeAttribute("aria-labelledby");
};

/** Keep a card control accessible without invoking Obsidian's aria-label tooltip. */
export function setCardTooltip(
  element: HTMLElement,
  label: string,
  showTooltip: boolean,
  options?: TooltipOptions,
): void {
  if (showTooltip) {
    removeHiddenLabel(element);
    element.setAttribute("aria-label", label);
    element.setAttribute(
      "data-tooltip-position",
      options?.placement ?? "top",
    );
    if (options?.delay !== undefined) {
      element.setAttribute("data-tooltip-delay", String(options.delay));
    }
    return;
  }

  element.removeAttribute("aria-label");
  for (const attribute of element.getAttributeNames()) {
    if (attribute.startsWith("data-tooltip")) {
      element.removeAttribute(attribute);
    }
  }

  const id = labelIdFor(element);
  let hidden = element.ownerDocument.getElementById(id);
  if (hidden === null) {
    hidden = (element.parentElement ?? element).createSpan();
    hidden.id = id;
    hidden.className = "slipbox-visually-hidden";
  }
  hidden.textContent = label;
  element.setAttribute("aria-labelledby", id);
}
