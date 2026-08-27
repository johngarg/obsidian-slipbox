export interface CardDeletionFileManager<File> {
  promptForDeletion(file: File): Promise<boolean>;
}

/**
 * Ask Obsidian to delete a card. The host prompt owns the complete deletion
 * transaction after confirmation, including the configured trash behavior.
 */
export function deleteCardWithConfirmation<File>(
  fileManager: CardDeletionFileManager<File>,
  file: File,
): Promise<boolean> {
  return fileManager.promptForDeletion(file);
}
