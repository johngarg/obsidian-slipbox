import type { SlipboxSettings } from "./settings.js";

export function resolveCardTitle(
  basename: string,
  frontmatter: Readonly<Record<string, unknown>> | undefined,
  settings: Pick<SlipboxSettings, "titleSource" | "titleProperty">,
): string {
  if (settings.titleSource !== "frontmatter") {
    return basename;
  }
  const value = frontmatter?.[settings.titleProperty];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : basename;
}
