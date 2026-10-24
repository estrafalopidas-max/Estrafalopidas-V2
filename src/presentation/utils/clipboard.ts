/**
 * Resilient cross-browser clipboard utility.
 * 
 * Works seamlessly in sandboxed environments and iFrames (such as Google AI Studio
 * development preview) where `navigator.clipboard.writeText` may throw `NotAllowedError`
 * due to missing focus or permissions-policy restrictions.
 *
 * Implements an automatic graceful fallback to `document.execCommand('copy')`
 * and never throws unhandled exceptions.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof text !== 'string' || !text) {
    return false;
  }

  // 1. Attempt to bring focus to the active window/document if permitted
  try {
    if (typeof window !== 'undefined' && typeof window.focus === 'function') {
      window.focus();
    }
  } catch {
    // Ignore sandbox focus restrictions
  }

  // 2. Try modern Clipboard API first
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipboardErr) {
      // In iFrames and certain browsers, writeText throws NotAllowedError: Document is not focused
      // or Write permission denied. We capture it and proceed to fallback.
      console.warn('[Clipboard] navigator.clipboard.writeText unavailable or rejected, using fallback:', clipboardErr);
    }
  }

  // 3. Fallback: temporary textarea with document.execCommand('copy')
  try {
    if (typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Styling to prevent layout shifting or scrolling
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('aria-hidden', 'true');
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      textArea.style.fontSize = '12pt'; // Prevent zoom on iOS

      document.body.appendChild(textArea);

      // Preserve existing user selection if any
      const selection = document.getSelection();
      const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);

      let success = false;
      try {
        success = document.execCommand('copy');
      } catch (cmdErr) {
        console.warn('[Clipboard] document.execCommand failed:', cmdErr);
      }

      document.body.removeChild(textArea);

      // Restore user selection
      if (selection && originalRange) {
        selection.removeAllRanges();
        selection.addRange(originalRange);
      }

      if (success) {
        return true;
      }
    }
  } catch (domErr) {
    console.warn('[Clipboard] DOM fallback exception:', domErr);
  }

  return false;
}
