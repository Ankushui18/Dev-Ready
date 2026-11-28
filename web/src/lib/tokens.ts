import type { TokenEntry } from '../types';

/** Find a local token matching a raw color value (for Figma-style "Suggested variables") */
export function findSuggestedToken(
  rawColor: string | undefined,
  tokens: TokenEntry[],
  activeMode?: string
): TokenEntry | null {
  if (!rawColor) return null;
  const target = rawColor.trim().toLowerCase();
  if (!target.startsWith('#')) return null;

  for (const t of tokens) {
    if (t.category !== 'color') continue;
    const modeVal = activeMode && t.modes?.[activeMode] ? t.modes[activeMode].trim().toLowerCase() : null;
    if (modeVal === target || t.value.trim().toLowerCase() === target) {
      return t;
    }
    if (t.modes) {
      for (const mv of Object.values(t.modes)) {
        if (mv.trim().toLowerCase() === target) return t;
      }
    }
  }
  return null;
}

/** Resolve a layer token ref like "--color-accent-blue" to its TokenEntry */
export function findTokenByRef(tokenRef: string | undefined, tokens: TokenEntry[]): TokenEntry | null {
  if (!tokenRef) return null;
  const clean = tokenRef.replace(/^--/, '').trim().toLowerCase();
  return tokens.find(t => t.name.replace(/^--/, '').trim().toLowerCase() === clean) || null;
}
