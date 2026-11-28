import type { DevReadyBundle, InspectLayer } from '../types';
import { contrastRatio } from './a11y';
import { flattenLayers } from './measure';

export type LintCategory = 'a11y' | 'token' | 'grid';

export interface LintIssue {
  id: string;
  layerId: string;
  layerName: string;
  category: LintCategory;
  severity: 'error' | 'warn';
  message: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignLintReport {
  issues: LintIssue[];
  counts: { all: number; a11y: number; token: number; grid: number };
}

function resolveBgHex(layer: InspectLayer, parentBg: string): string {
  const f = layer.fills?.find(x => x.type === 'SOLID' && x.color && (x.opacity === undefined || x.opacity > 0.6));
  return f?.color || parentBg;
}

function isOnGrid(val: number, step = 4): boolean {
  const rounded = Math.round(val);
  return rounded % step === 0;
}

/**
 * Fast, pure Canvas Design Lint analyzer:
 * 1. WCAG AA contrast failures on TEXT layers
 * 2. Hardcoded (unbound) solid colors on fills/strokes
 * 3. Off-4px-grid auto-layout gap/padding or frame dimensions
 */
export function runDesignLint(bundle: DevReadyBundle): DesignLintReport {
  const issues: LintIssue[] = [];
  const tokenHexes = new Set(
    bundle.tokens.filter(t => t.category === 'color').map(t => t.value.trim().toLowerCase())
  );

  // Build effective background map top-down
  const bgMap = new Map<string, string>();
  const walkBg = (node: InspectLayer, inheritedBg: string) => {
    const bg = node.type === 'TEXT' ? inheritedBg : resolveBgHex(node, inheritedBg);
    bgMap.set(node.id, bg);
    if (node.children) {
      for (const c of node.children) walkBg(c, bg);
    }
  };
  walkBg(bundle.root, bundle.backgroundColor || '#FFFFFF');

  const layers = flattenLayers(bundle.root);
  for (const l of layers) {
    if (l.visible === false || l.id === bundle.root.id) continue;

    // 1. Contrast check on TEXT layers
    if (l.type === 'TEXT' && l.text && l.text.trim().length > 0) {
      const fg = l.fills?.find(f => f.type === 'SOLID' && f.color)?.color;
      const bg = bgMap.get(l.id) || bundle.backgroundColor || '#FFFFFF';
      if (fg && bg) {
        const ratio = contrastRatio(fg, bg);
        const fontSize = l.typography?.fontSize || 14;
        const fontWeight = l.typography?.fontWeight || 400;
        const isLarge = fontSize >= 18.66 || (fontSize >= 14 && fontWeight >= 700);
        const minRatio = isLarge ? 3.0 : 4.5;
        if (ratio !== null && ratio > 0 && ratio < minRatio) {
          issues.push({
            id: `lint-a11y-${l.id}`,
            layerId: l.id,
            layerName: l.name,
            category: 'a11y',
            severity: 'error',
            message: `Low contrast ${ratio.toFixed(2)}:1 (needs ${minRatio}:1 AA)`,
            x: l.x,
            y: l.y,
            width: l.width,
            height: l.height
          });
        }
      }
    }

    // 2. Hardcoded (unbound) solid color check
    const unboundFill = l.fills?.find(
      f =>
        f.type === 'SOLID' &&
        f.color &&
        !f.token &&
        !tokenHexes.has(f.color.trim().toLowerCase())
    );
    if (unboundFill?.color) {
      issues.push({
        id: `lint-tok-${l.id}`,
        layerId: l.id,
        layerName: l.name,
        category: 'token',
        severity: 'warn',
        message: `Hardcoded fill ${unboundFill.color} (no design token)`,
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height
      });
    }

    // 3. Off-4px-grid spacing check (auto-layout gap/padding)
    if (l.autoLayout) {
      const al = l.autoLayout;
      const badParts: string[] = [];
      if (al.gap > 0 && !isOnGrid(al.gap)) badParts.push(`gap ${al.gap}px`);
      const pads = [al.paddingTop, al.paddingRight, al.paddingBottom, al.paddingLeft].filter(p => p > 0);
      const badPad = pads.find(p => !isOnGrid(p));
      if (badPad !== undefined) badParts.push(`padding ${badPad}px`);
      if (badParts.length > 0) {
        issues.push({
          id: `lint-grid-${l.id}`,
          layerId: l.id,
          layerName: l.name,
          category: 'grid',
          severity: 'warn',
          message: `Off 4px grid (${badParts.join(', ')})`,
          x: l.x,
          y: l.y,
          width: l.width,
          height: l.height
        });
      }
    }
  }

  let a11y = 0;
  let token = 0;
  let grid = 0;
  for (const i of issues) {
    if (i.category === 'a11y') a11y++;
    else if (i.category === 'token') token++;
    else grid++;
  }

  return {
    issues,
    counts: { all: issues.length, a11y, token, grid }
  };
}
