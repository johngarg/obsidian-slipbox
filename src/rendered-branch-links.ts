import type { LinkCache } from "obsidian";

import {
  EXPLICIT_BRANCH_MARKER,
  explicitBranchLabel,
} from "./branch-links.js";

export const RENDERED_BRANCH_LINK_CLASS = "slipbox-explicit-branch-link";
export const RENDERED_BRANCH_MARKER_CLASS = "slipbox-explicit-branch-marker";

export interface RenderedBranchLinkOptions {
  readonly enabled: boolean;
  readonly outline?: boolean;
  readonly hideMarker?: boolean;
  readonly links: readonly LinkCache[];
  readonly targetAddressForLink?: (link: string) => string | undefined;
}

interface RenderedLinkReference {
  readonly label: string | null;
}

/**
 * Present explicitly marked aliases in one Slipbox-owned Markdown rendering.
 *
 * Matching all cached links, rather than only branch candidates, preserves
 * source order when an ordinary link and an explicit alias render with the
 * same destination and visible text. Anchors inside embeds are deliberately
 * ignored because embeds are not explicit branch syntax.
 */
export function applyRenderedBranchLinkOutlines(
  target: HTMLElement,
  options: RenderedBranchLinkOptions,
): void {
  target.querySelectorAll<HTMLElement>(`.${RENDERED_BRANCH_MARKER_CLASS}`)
    .forEach((element) => element.replaceWith(...Array.from(element.childNodes)));
  target.querySelectorAll<HTMLElement>(`.${RENDERED_BRANCH_LINK_CLASS}`)
    .forEach((element) => element.classList.remove(RENDERED_BRANCH_LINK_CLASS));
  const outline = options.outline ?? true;
  const hideMarker = options.hideMarker ?? false;
  if (!options.enabled || (!outline && !hideMarker)) {
    return;
  }

  const referencesByLink = groupReferences(
    options.links,
    options.targetAddressForLink,
  );
  target.querySelectorAll<HTMLAnchorElement>("a.internal-link")
    .forEach((anchor) => {
      if (anchor.closest(".internal-embed") !== null) {
        return;
      }
      const link = anchor.dataset.href ?? anchor.getAttribute("href") ?? "";
      if (link === "") {
        return;
      }
      const queue = referencesByLink.get(link);
      const reference = queue?.shift();
      const renderedLabel = renderedBranchLabel(anchor.textContent ?? "");
      if (reference?.label !== null && reference?.label === renderedLabel) {
        if (outline) {
          anchor.classList.add(RENDERED_BRANCH_LINK_CLASS);
        }
        if (hideMarker) {
          hideLeadingMarker(anchor);
        }
      }
    });
}

function hideLeadingMarker(anchor: HTMLAnchorElement): void {
  const displayText = anchor.textContent ?? "";
  const leadingWhitespace = displayText.slice(EXPLICIT_BRANCH_MARKER.length)
    .match(/^\s*/u)?.[0] ?? "";
  let remaining = EXPLICIT_BRANCH_MARKER.length + leadingWhitespace.length;
  let endNode: Text | undefined;
  let endOffset = 0;
  const visit = (node: Node): boolean => {
    if (node.nodeType === 3) {
      const text = node as Text;
      if (remaining <= text.data.length) {
        endNode = text;
        endOffset = remaining;
        return true;
      }
      remaining -= text.data.length;
      return false;
    }
    return Array.from(node.childNodes).some(visit);
  };
  if (!visit(anchor) || endNode === undefined) {
    return;
  }

  const range = anchor.ownerDocument.createRange();
  range.setStart(anchor, 0);
  range.setEnd(endNode, endOffset);
  const markerElement = anchor.ownerDocument.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  );
  markerElement.className = RENDERED_BRANCH_MARKER_CLASS;
  markerElement.hidden = true;
  markerElement.setAttribute("aria-hidden", "true");
  markerElement.append(range.extractContents());
  range.insertNode(markerElement);
}

function groupReferences(
  links: readonly LinkCache[],
  targetAddressForLink?: (link: string) => string | undefined,
): Map<string, RenderedLinkReference[]> {
  const grouped = new Map<string, RenderedLinkReference[]>();
  for (const link of links) {
    const syntacticLabel = explicitBranchLabel(link, true);
    const reference = {
      label: syntacticLabel === null
        ? null
        : explicitBranchLabel(
          link,
          true,
          targetAddressForLink?.(link.link),
        ),
    };
    const existing = grouped.get(link.link);
    if (existing === undefined) {
      grouped.set(link.link, [reference]);
    } else {
      existing.push(reference);
    }
  }
  return grouped;
}

function renderedBranchLabel(displayText: string): string | null {
  if (!displayText.startsWith(EXPLICIT_BRANCH_MARKER)) {
    return null;
  }
  const label = displayText.slice(EXPLICIT_BRANCH_MARKER.length).trim();
  return label === "" ? null : label;
}
