import type { InspectLayer } from '../types';

export interface A11yFinding {
  id: string;
  layerId: string;
  layerName: string;
  category: 'contrast' | 'touch-target' | 'text-size';
  severity: 'error' | 'warning' | 'pass';
  title: string;
  detail: string;
  fg?: string;
  bg?: string;
  ratio?: number;
}

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16)
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
  }
  return null;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return null;
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function blendHex(fgHex: string, alpha: number, bgHex: string): string {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return fgHex;
  const r = Math.round(fg[0] * alpha + bg[0] * (1 - alpha));
  const g = Math.round(fg[1] * alpha + bg[1] * (1 - alpha));
  const b = Math.round(fg[2] * alpha + bg[2] * (1 - alpha));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function runA11yAudit(root: InspectLayer, artboardBg = '#FFFFFF'): A11yFinding[] {
  const findings: A11yFinding[] = [];

  function walk(node: InspectLayer, inheritedBg: string) {
    if (node.visible === false) return;

    let currentBg = inheritedBg;
    if (node.type !== 'TEXT' && node.fills && node.fills.length > 0) {
      const solid = node.fills.find(f => f.type === 'SOLID' && f.color);
      if (solid && solid.color) {
        const op = (solid.opacity ?? 1) * (node.opacity ?? 1);
        currentBg = op >= 0.99 ? solid.color : blendHex(solid.color, op, inheritedBg);
      }
    }

    // 1. Contrast + font-size check on TEXT layers
    if (node.type === 'TEXT' && node.typography) {
      const fgFill = node.fills?.find(f => f.type === 'SOLID' && f.color);
      if (fgFill?.color) {
        const fgOp = (fgFill.opacity ?? 1) * (node.opacity ?? 1);
        const effFg = fgOp >= 0.99 ? fgFill.color : blendHex(fgFill.color, fgOp, currentBg);
        const ratio = contrastRatio(effFg, currentBg);
        if (ratio !== null) {
          const isLarge = node.typography.fontSize >= 18 || (node.typography.fontSize >= 14 && node.typography.fontWeight >= 700);
          const minAA = isLarge ? 3.0 : 4.5;
          if (ratio < minAA) {
            findings.push({
              id: `contrast-${node.id}`,
              layerId: node.id,
              layerName: node.name,
              category: 'contrast',
              severity: 'error',
              title: `Low text contrast (${ratio}:1)`,
              detail: `Requires ≥ ${minAA}:1 for WCAG AA (${isLarge ? 'large' : 'normal'} text).`,
              fg: effFg,
              bg: currentBg,
              ratio
            });
          } else if (ratio < 7.0) {
            findings.push({
              id: `contrast-ok-${node.id}`,
              layerId: node.id,
              layerName: node.name,
              category: 'contrast',
              severity: 'pass',
              title: `WCAG AA Pass (${ratio}:1)`,
              detail: `Meets AA (${minAA}:1). Raise to 7:1 for AAA.`,
              fg: effFg,
              bg: currentBg,
              ratio
            });
          } else {
            findings.push({
              id: `contrast-aaa-${node.id}`,
              layerId: node.id,
              layerName: node.name,
              category: 'contrast',
              severity: 'pass',
              title: `WCAG AAA Pass (${ratio}:1)`,
              detail: `Excellent legibility against ${currentBg.toUpperCase()}.`,
              fg: effFg,
              bg: currentBg,
              ratio
            });
          }
        }
      }

      if (node.typography.fontSize < 12) {
        findings.push({
          id: `text-size-${node.id}`,
          layerId: node.id,
          layerName: node.name,
          category: 'text-size',
          severity: 'warning',
          title: `Small font size (${node.typography.fontSize}px)`,
          detail: 'Text smaller than 12px can be difficult to read on mobile & standard displays.'
        });
      }
    }

    // 2. Touch target size check on interactive elements (buttons, inputs, controls)
    const looksInteractive =
      node.interactive ||
      /\b(btn|button|cta|input|toggle|switch|tab|close|icon-btn|link|chip)\b/i.test(node.name);
    if (looksInteractive && node.id !== root.id) {
      if (node.width < 44 || node.height < 44) {
        findings.push({
          id: `touch-${node.id}`,
          layerId: node.id,
          layerName: node.name,
          category: 'touch-target',
          severity: 'warning',
          title: `Small touch target (${Math.round(node.width)}×${Math.round(node.height)}px)`,
          detail: 'WCAG 2.2 / Apple HIG recommends at least 44×44px for interactive tap targets.'
        });
      }
    }

    if (node.children) {
      for (const c of node.children) walk(c, currentBg);
    }
  }

  walk(root, artboardBg);
  // Sort: errors first, then warnings, then passes
  const order = { error: 0, warning: 1, pass: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}
