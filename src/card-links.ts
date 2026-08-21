import type { App, TFile } from "obsidian";

export interface FiledCardLinkLookup {
  resolveFile(linkPath: string, sourcePath: string): TFile | null;
  filedPathForFile(file: TFile): string | undefined;
  firstFiledPathAtAddress(address: string): string | undefined;
}

export interface FiledCardLinkResolution {
  readonly path: string;
  readonly resolvedBy: "file" | "address";
}

export type RenderedLinkAction =
  | { readonly kind: "card"; readonly path: string }
  | { readonly kind: "note"; readonly linktext: string }
  | { readonly kind: "external" };

/** Resolve a normal Obsidian file link first, then an exact Slipbox address. */
export function resolveFiledCardLink(
  linkPath: string,
  sourcePath: string,
  lookup: FiledCardLinkLookup,
): FiledCardLinkResolution | undefined {
  const file = lookup.resolveFile(linkPath, sourcePath);
  if (file !== null) {
    const path = lookup.filedPathForFile(file);
    return path === undefined ? undefined : { path, resolvedBy: "file" };
  }
  const path = lookup.firstFiledPathAtAddress(linkPath);
  return path === undefined ? undefined : { path, resolvedBy: "address" };
}

/** Preserve modified/native opening while keeping plain filed links in the Deck. */
export function renderedLinkAction(
  internal: boolean,
  newLeaf: boolean,
  linktext: string,
  filed: FiledCardLinkResolution | undefined,
): RenderedLinkAction {
  if (!internal) {
    return { kind: "external" };
  }
  if (!newLeaf && filed !== undefined) {
    return { kind: "card", path: filed.path };
  }
  return {
    kind: "note",
    linktext: filed?.resolvedBy === "address" ? filed.path : linktext,
  };
}

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
