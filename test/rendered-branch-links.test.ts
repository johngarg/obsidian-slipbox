import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";
import type { LinkCache } from "obsidian";

import {
  RENDERED_BRANCH_LINK_CLASS,
  RENDERED_BRANCH_MARKER_CLASS,
  applyRenderedBranchLinkOutlines,
} from "../src/rendered-branch-links.js";

const linkCache = (
  original: string,
  link: string,
  displayText?: string,
): LinkCache => ({
  original,
  link,
  position: {
    start: { line: 0, col: 0, offset: 0 },
    end: { line: 0, col: original.length, offset: original.length },
  },
  ...(displayText === undefined ? {} : { displayText }),
});

function body() {
  const window = new Window();
  const target = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  );
  window.document.body.append(target);
  const internal = (link: string, text: string, parent = target) => {
    const anchor = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "a",
    );
    anchor.className = "internal-link";
    anchor.dataset.href = link;
    anchor.textContent = text;
    parent.append(anchor);
    return anchor;
  };
  return { window, target, internal };
}

describe("rendered explicit branch links", () => {
  test("outlines marked Wiki and Markdown aliases without resolving them", () => {
    const { target, internal } = body();
    const wiki = internal("Target", "+a");
    const markdown = internal("Missing.md", "+β");
    const self = internal("Source", "+self");

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      links: [
        linkCache("[[Target|+a]]", "Target", "+a"),
        linkCache("[+β](Missing.md)", "Missing.md", "+β"),
        linkCache("[[Source|+self]]", "Source", "+self"),
      ],
    });

    for (const anchor of [wiki, markdown, self]) {
      assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), true);
    }
  });

  test("requires explicit alias syntax and excludes embeds and external links", () => {
    const { window, target, internal } = body();
    const implicit = internal("+a", "+a");
    const ordinary = internal("Target", "Target");
    const embed = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    embed.className = "internal-embed";
    target.append(embed);
    const embedded = internal("Target", "+a", embed);
    const external = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "a",
    );
    external.href = "https://example.org";
    external.textContent = "+external";
    target.append(external);

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      links: [
        linkCache("[[+a]]", "+a", "+a"),
        linkCache("[[Target]]", "Target", "Target"),
        linkCache("[[Target|+a]]", "Target", "+a"),
      ],
    });

    for (const anchor of [implicit, ordinary, embedded, external]) {
      assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), false);
    }
  });

  test("preserves source order for identical implicit and explicit renderings", () => {
    const { target, internal } = body();
    const implicit = internal("+a", "+a");
    const explicit = internal("+a", "+a");

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      links: [
        linkCache("[[+a]]", "+a", "+a"),
        linkCache("[[+a|+a]]", "+a", "+a"),
      ],
    });

    assert.equal(implicit.classList.contains(RENDERED_BRANCH_LINK_CLASS), false);
    assert.equal(explicit.classList.contains(RENDERED_BRANCH_LINK_CLASS), true);
  });

  test("preserves source order when ordinary text differs at one destination", () => {
    const { target, internal } = body();
    const ordinary = internal("Folder/Target", "Target");
    const explicit = internal("Folder/Target", "+a");

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      links: [
        linkCache("[[Folder/Target]]", "Folder/Target"),
        linkCache("[[Folder/Target|+a]]", "Folder/Target", "+a"),
      ],
    });

    assert.equal(ordinary.classList.contains(RENDERED_BRANCH_LINK_CLASS), false);
    assert.equal(explicit.classList.contains(RENDERED_BRANCH_LINK_CLASS), true);
  });

  test("uses only canonical + syntax and removes stale decoration", () => {
    const { target, internal } = body();
    const anchor = internal("Target", "+branch");
    const links = [linkCache(
      "[[Target|+branch]]",
      "Target",
      "+branch",
    )];

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      links,
    });
    assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), true);

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: false,
      links,
    });
    assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), false);

    anchor.textContent = "→→ branch";
    anchor.classList.add(RENDERED_BRANCH_LINK_CLASS);
    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      links: [linkCache(
        "[[Target|→→ branch]]",
        "Target",
        "→→ branch",
      )],
    });
    assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), false);
  });

  test("hides + independently of the outline and restores it", () => {
    const { target, internal } = body();
    const anchor = internal("Target", "+  branch");
    const links = [linkCache(
      "[[Target|+  branch]]",
      "Target",
      "+  branch",
    )];

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      outline: false,
      hideMarker: true,
      links,
    });
    assert.equal(anchor.textContent, "+  branch");
    assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), false);
    const marker = anchor.querySelector(
      `.${RENDERED_BRANCH_MARKER_CLASS}`,
    ) as unknown as HTMLElement | null;
    assert.equal(marker?.textContent, "+  ");
    assert.equal(marker?.hidden, true);
    assert.equal(marker?.getAttribute("aria-hidden"), "true");

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      outline: true,
      hideMarker: false,
      links,
    });
    assert.equal(anchor.textContent, "+  branch");
    assert.equal(anchor.querySelector(`.${RENDERED_BRANCH_MARKER_CLASS}`), null);
    assert.equal(anchor.classList.contains(RENDERED_BRANCH_LINK_CLASS), true);
  });

  test("keeps +address ordinary and presents ++address as a branch", () => {
    const { target, internal } = body();
    const ordinary = internal("Plus", "+12");
    const branch = internal("Plus", "++12");

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      hideMarker: true,
      links: [
        linkCache("[[Plus|+12]]", "Plus", "+12"),
        linkCache("[[Plus|++12]]", "Plus", "++12"),
      ],
      targetAddressForLink: () => "+12",
    });

    assert.equal(
      ordinary.classList.contains(RENDERED_BRANCH_LINK_CLASS),
      false,
    );
    assert.equal(
      ordinary.querySelector(`.${RENDERED_BRANCH_MARKER_CLASS}`),
      null,
    );
    assert.equal(branch.classList.contains(RENDERED_BRANCH_LINK_CLASS), true);
    assert.equal(
      branch.querySelector(`.${RENDERED_BRANCH_MARKER_CLASS}`)?.textContent,
      "+",
    );
    assert.equal(branch.textContent, "++12");
  });

  test("does not hide markers on non-branch links or inside embeds", () => {
    const { window, target, internal } = body();
    const implicit = internal("+a", "+a");
    const ordinary = internal("Target", "+ordinary");
    const embed = window.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    embed.className = "internal-embed";
    target.append(embed);
    const embedded = internal("Target", "+a", embed);

    applyRenderedBranchLinkOutlines(target as unknown as HTMLElement, {
      enabled: true,
      outline: false,
      hideMarker: true,
      links: [
        linkCache("[[+a]]", "+a", "+a"),
        linkCache("[[Target|ordinary]]", "Target", "ordinary"),
        linkCache("[[Target|+a]]", "Target", "+a"),
      ],
    });

    for (const anchor of [implicit, ordinary, embedded]) {
      assert.equal(anchor.textContent?.startsWith("+"), true);
      assert.equal(anchor.querySelector(`.${RENDERED_BRANCH_MARKER_CLASS}`), null);
    }
  });
});
