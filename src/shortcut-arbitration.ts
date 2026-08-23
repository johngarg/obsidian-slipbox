export type ShortcutArbitrationResult =
  | "command"
  | "conflict"
  | "slipbox";

export type ShortcutClaim =
  | "same-slipbox-command"
  | "other-command"
  | "unclaimed";

export function classifyShortcutClaim(
  defaultPrevented: boolean,
  configuredAction: string,
  handledSlipboxAction?: string,
): ShortcutClaim {
  if (handledSlipboxAction === configuredAction) {
    return "same-slipbox-command";
  }
  if (defaultPrevented || handledSlipboxAction !== undefined) {
    return "other-command";
  }
  return "unclaimed";
}

/**
 * Decide the winner after Obsidian's keymap has had an opportunity to handle
 * a configured Slipbox shortcut. A customized Obsidian command always wins.
 */
export function arbitrateShortcut(
  claim: ShortcutClaim,
  runSlipboxShortcut: () => void,
  reportConflict: () => void,
): ShortcutArbitrationResult {
  if (claim === "same-slipbox-command") {
    return "command";
  }
  if (claim === "other-command") {
    reportConflict();
    return "conflict";
  }
  runSlipboxShortcut();
  return "slipbox";
}
