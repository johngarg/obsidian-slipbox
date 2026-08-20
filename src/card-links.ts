import type { App, TFile } from "obsidian";

/**
 * Generate a link to a filed card using its address as the display text.
 *
 * Obsidian remains responsible for the target, relative path, and Wikilink or
 * Markdown-link syntax. The address is presentation only and is not copied
 * into the target note's aliases.
 */
export function generateFiledCardLink(
  app: Pick<App, "fileManager">,
  file: TFile,
  sourcePath: string,
  address: string,
): string {
  return app.fileManager.generateMarkdownLink(
    file,
    sourcePath,
    undefined,
    address,
  );
}
