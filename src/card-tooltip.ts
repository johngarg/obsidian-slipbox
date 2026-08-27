import type { TooltipOptions } from "obsidian";

let accessibleLabelSequence = 0;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

export interface SlipboxTooltipOptions extends TooltipOptions {
  readonly accessibleLabel?: string;
}

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

const setHiddenLabel = (element: HTMLElement, label: string): void => {
  const id = labelIdFor(element);
  let hidden = element.ownerDocument.getElementById(id);
  if (hidden === null) {
    hidden = element.ownerDocument.createElementNS(
      HTML_NAMESPACE,
      "span",
    );
    (element.parentElement ?? element).append(hidden);
    hidden.id = id;
    hidden.className = "slipbox-visually-hidden";
  }
  hidden.textContent = label;
  element.setAttribute("aria-labelledby", id);
};

/** Keep a Slipbox control accessible without invoking an unwanted tooltip. */
export function setCardTooltip(
  element: HTMLElement,
  label: string,
  showTooltip: boolean,
  options?: SlipboxTooltipOptions,
): void {
  const accessibleLabel = options?.accessibleLabel ?? label;
  if (showTooltip) {
    if (accessibleLabel === label) {
      removeHiddenLabel(element);
    } else {
      setHiddenLabel(element, accessibleLabel);
    }
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

  setHiddenLabel(element, accessibleLabel);
}
