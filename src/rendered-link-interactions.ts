export interface RenderedLinkInteractionOptions {
  readonly previewEnabled: boolean;
  readonly followEnabled: boolean;
  readonly preview: (
    event: MouseEvent,
    link: HTMLAnchorElement,
    linktext: string,
  ) => void;
  readonly follow: (
    event: MouseEvent,
    link: HTMLAnchorElement,
    linktext: string,
  ) => void;
}

export interface RenderedLinkPolicy {
  readonly preview: boolean;
  readonly follow: boolean;
}

/** Resolve the same preview/follow policy for card bodies and backlink rows. */
export function renderedLinkPolicy(
  previewEnabled: boolean,
  followEnabled: boolean,
  surfaceInteractive = true,
): RenderedLinkPolicy {
  return {
    preview: surfaceInteractive && previewEnabled,
    follow: surfaceInteractive && followEnabled,
  };
}

/** Mark one Slipbox-owned anchor as enabled or inert without hiding its text. */
export function applyOwnedLinkAccessibility(
  link: HTMLAnchorElement,
  followEnabled: boolean,
  tabbable = true,
): void {
  if (followEnabled) {
    link.removeAttribute("aria-disabled");
    link.removeAttribute("data-slipbox-link-disabled");
    link.tabIndex = tabbable ? 0 : -1;
    return;
  }
  link.setAttribute("aria-disabled", "true");
  link.dataset.slipboxLinkDisabled = "true";
  link.tabIndex = -1;
}

/** Apply accessible inert-link state after MarkdownRenderer has populated a card. */
export function applyRenderedLinkAccessibility(
  target: HTMLElement,
  followEnabled: boolean,
): void {
  target.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    applyOwnedLinkAccessibility(link, followEnabled);
  });
}

/** Share preview and activation gating across every rendered card body. */
export function attachRenderedLinkInteractions(
  target: HTMLElement,
  options: RenderedLinkInteractionOptions,
): void {
  const policy = renderedLinkPolicy(
    options.previewEnabled,
    options.followEnabled,
  );
  applyRenderedLinkAccessibility(target, policy.follow);
  target.addEventListener("mouseover", (event) => {
    const ElementType = target.ownerDocument.defaultView?.Element;
    if (
      !policy.preview ||
      ElementType === undefined ||
      !(event.target instanceof ElementType)
    ) {
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>("a.internal-link");
    const linktext = renderedLinkText(link);
    if (link !== null && linktext !== null) {
      options.preview(event, link, linktext);
    }
  });

  const activate = (event: MouseEvent): void => {
    const ElementType = target.ownerDocument.defaultView?.Element;
    if (ElementType === undefined || !(event.target instanceof ElementType)) {
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>("a");
    const linktext = renderedLinkText(link);
    if (link === null || linktext === null) {
      return;
    }
    if (event.type === "auxclick" && event.button !== 1) {
      if (!policy.follow) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (policy.follow) {
      options.follow(event, link, linktext);
    }
  };
  target.addEventListener("click", activate, { capture: true });
  target.addEventListener("auxclick", activate, { capture: true });
}

function renderedLinkText(link: HTMLAnchorElement | null): string | null {
  if (link === null) {
    return null;
  }
  const linktext = link.dataset.href ?? link.getAttribute("href") ?? "";
  return linktext === "" ? null : linktext;
}
