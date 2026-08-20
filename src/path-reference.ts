/** True when a file path is exactly or transitively beneath a target path. */
export function pathIsAtOrBelow(path: string, target: string): boolean {
  const prefix = `${target.replace(/\/$/, "")}/`;
  return path === target || path.startsWith(prefix);
}

/** Rewrite an exact file or descendant path for a file/folder rename. */
export function renamePathReference(
  path: string,
  oldPath: string,
  newPath: string,
): string {
  if (path === oldPath) {
    return newPath;
  }
  const oldPrefix = `${oldPath.replace(/\/$/, "")}/`;
  if (!path.startsWith(oldPrefix)) {
    return path;
  }
  const newPrefix = `${newPath.replace(/\/$/, "")}/`;
  return `${newPrefix}${path.slice(oldPrefix.length)}`;
}
