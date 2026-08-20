import { filingPreviewKey, type FilingPreview } from "./filing-preview.js";

export function renderOrUpdateFilingGhost(
  parent: HTMLElement,
  preview: FilingPreview,
  existing: HTMLElement | null,
): HTMLElement {
  const ghost = existing ?? parent.createDiv();
  ghost.className = "slipbox-card slipbox-filing-ghost";
  ghost.dataset.previewKey = filingPreviewKey(preview.sourcePath);
  ghost.dataset.index = String(preview.insertionIndex);
  ghost.removeAttribute("data-path");
  ghost.setAttribute(
    "aria-label",
    `Preview: ${preview.address} · ${preview.title}; not yet filed`,
  );
  ghost.setAttribute("aria-disabled", "true");

  let frame = ghost.querySelector<HTMLElement>(".slipbox-card-frame");
  if (frame === null) {
    frame = ghost.createDiv();
    frame.className = "slipbox-card-frame";
    const identity = frame.createDiv();
    identity.className = "slipbox-filing-ghost-identity";
    const address = identity.createSpan();
    address.className = "slipbox-card-address slipbox-filing-ghost-address";
    const title = identity.createSpan();
    title.className = "slipbox-filing-ghost-title";
    const note = identity.createSpan();
    note.className = "slipbox-filing-ghost-note";
    note.textContent = "Preview · not yet filed";
  }

  const address = ghost.querySelector<HTMLElement>(
    ".slipbox-filing-ghost-address",
  );
  const title = ghost.querySelector<HTMLElement>(
    ".slipbox-filing-ghost-title",
  );
  if (address !== null) {
    address.textContent = preview.address;
  }
  if (title !== null) {
    title.textContent = preview.title;
  }
  if (ghost.parentElement !== parent) {
    parent.append(ghost);
  }
  return ghost;
}

export function removeFilingGhost(existing: HTMLElement | null): null {
  existing?.remove();
  return null;
}
