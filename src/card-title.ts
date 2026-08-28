import type { SlipboxSettings } from "./settings.js";

export function cardHeaderTitle(
  resolvedTitle: string | null,
  showTitle: boolean,
): string | null {
  return showTitle ? resolvedTitle : null;
}

export function resolveCardDisplayTitle(
  basename: string,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  settings: Pick<SlipboxSettings, "titleSource" | "titleProperty">,
): string | null {
  if (settings.titleSource !== "frontmatter") {
    return basename;
  }
  const value = frontmatter?.[settings.titleProperty];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

export function resolveCardTitle(
  basename: string,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  settings: Pick<SlipboxSettings, "titleSource" | "titleProperty">,
): string {
  return resolveCardDisplayTitle(basename, frontmatter, settings) ?? basename;
}
