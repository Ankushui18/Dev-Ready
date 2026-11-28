export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export const MOD_KEY = isMac ? '⌘' : 'Ctrl+';
export const SHIFT_KEY = isMac ? '⇧' : 'Shift+';

export function fmtMod(key: string): string {
  return `${MOD_KEY}${key}`;
}

export function fmtShift(key: string): string {
  return `${SHIFT_KEY}${key}`;
}
