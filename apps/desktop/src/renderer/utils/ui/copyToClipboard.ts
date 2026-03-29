/**
 * Copy text to clipboard with fallback for Electron sandboxed environments
 * where navigator.clipboard may be unavailable or permission-denied.
 */
export function copyToClipboard(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
