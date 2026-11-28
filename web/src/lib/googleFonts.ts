import type { InspectLayer } from '../types';

const SYSTEM_OR_LOADED_FONTS = new Set([
  'inter',
  'jetbrains mono',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'arial',
  'helvetica',
  'helvetica neue',
  'sf pro',
  'sf pro display',
  'sf pro text',
  'sf mono',
  'segoe ui',
  'roboto', // loaded on demand only if not system, actually load Roboto too!
  'times new roman',
  'georgia',
  'verdana',
  'tahoma',
  'courier new',
  'apple-system',
  '-apple-system',
  'blinkmacsystemfont'
]);

// Keep Roboto loadable from Google Fonts on non-Android desktops
SYSTEM_OR_LOADED_FONTS.delete('roboto');

const loadedFamilies = new Set<string>();

/** Collect unique external font families & weights used inside a layer tree. */
export function collectFontSpecs(root: InspectLayer): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  const walk = (node: InspectLayer) => {
    const raw = node.typography?.fontFamily?.trim();
    if (raw) {
      const key = raw.toLowerCase();
      if (!SYSTEM_OR_LOADED_FONTS.has(key) && /^[a-zA-Z0-9\s-]+$/.test(raw)) {
        let weights = map.get(raw);
        if (!weights) {
          weights = new Set<number>();
          map.set(raw, weights);
        }
        const w = Math.min(900, Math.max(100, Math.round((node.typography?.fontWeight || 400) / 100) * 100));
        weights.add(w);
      }
    }
    if (node.children) {
      for (const c of node.children) walk(c);
    }
  };
  walk(root);
  return map;
}

/**
 * Dynamically injects a single deduped Google Fonts <link> for fonts used in
 * imported Figma screens so vector previews render with real typography.
 */
export function ensureGoogleFontsLoaded(root: InspectLayer): string[] {
  if (typeof document === 'undefined') return [];
  const specs = collectFontSpecs(root);
  const toLoad: string[] = [];

  for (const [family, weights] of specs.entries()) {
    const norm = family.toLowerCase();
    if (loadedFamilies.has(norm)) continue;
    loadedFamilies.add(norm);
    const sorted = [...weights].sort((a, b) => a - b);
    const encoded = encodeURIComponent(family).replace(/%20/g, '+');
    toLoad.push(`family=${encoded}:wght@${sorted.join(';')}`);
  }

  if (toLoad.length === 0) return [];

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${toLoad.slice(0, 8).join('&')}&display=swap`;
  link.setAttribute('data-devready-gfonts', '1');
  document.head.appendChild(link);
  return [...specs.keys()];
}
