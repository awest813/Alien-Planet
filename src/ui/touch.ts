// A phone or tablet: no mouse to hover or right-click with, so the help says tap instead.
export const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

// Wording for a touch screen: no keyboard hints ("(G)", "with Q"), and tap rather than click.
export function forTouch(text: string): string {
  if (!TOUCH) {
    return text;
  }
  return text
    .replace(/ \((?:[A-Z0-9]|Space|Esc|Tab)\)/g, '')
    .replace(/\bDraft with Q\b/g, 'Draft from the top bar')
    .replace(/\bClick\b/g, 'Tap')
    .replace(/\bclick\b/g, 'tap');
}
