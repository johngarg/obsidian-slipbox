import type { CardSize } from "./settings.js";

const LEGACY_CLASS_ALIASES: Readonly<Record<string, string>> = {
  "is-on-desk": "is-in-tray",
  "slipbox-card-desk-toggle": "slipbox-card-tray-toggle",
  "backlink-desk-toggle": "backlink-tray-toggle",
};

function legacyDeskClass(className: string): string | null {
  if (className.startsWith("slipbox-desk")) {
    return `slipbox-tray${className.slice("slipbox-desk".length)}`;
  }
  return LEGACY_CLASS_ALIASES[className] ?? null;
}

export function deskClassNames(...classLists: readonly string[]): string {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const className of classLists.flatMap((value) => value.split(/\s+/u))) {
    if (className === "" || seen.has(className)) {
      continue;
    }
    seen.add(className);
    result.push(className);
    const legacy = legacyDeskClass(className);
    if (legacy !== null && !seen.has(legacy)) {
      seen.add(legacy);
      result.push(legacy);
    }
  }
  return result.join(" ");
}

export function toggleDeskPresenceClass(
  element: Element,
  onDesk: boolean,
): void {
  element.classList.toggle("is-on-desk", onDesk);
  element.classList.toggle("is-in-tray", onDesk);
}

export function setDeskCustomProperty(
  element: HTMLElement,
  property: `--slipbox-desk-${string}`,
  value: string,
): void {
  const legacy = `--slipbox-tray-${property.slice("--slipbox-desk-".length)}`;
  element.style.setProperty(legacy, value);
  element.style.setProperty(property, `var(${legacy})`);
}

export function setDeskCardSizeData(
  element: HTMLElement,
  size: CardSize,
): void {
  element.dataset.deskCardSize = size;
  element.dataset.trayCardSize = size;
}
