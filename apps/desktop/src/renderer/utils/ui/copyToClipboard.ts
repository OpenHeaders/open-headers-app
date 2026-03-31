/**
 * Copy text to clipboard using the modern Clipboard API.
 */
export function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}
