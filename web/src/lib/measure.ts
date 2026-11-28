import type { InspectLayer, UnitMode } from '../types';

export interface RedlineSegment {
  id: string;
  orientation: 'horizontal' | 'vertical';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distance: number;
  labelX: number;
  labelY: number;
  /** Optional dashed guide line extending from the target box to the measurement */
  guide?: { x1: number; y1: number; x2: number; y2: number };
}

export interface PaddingOverlay {
  side: 'top' | 'right' | 'bottom' | 'left';
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export interface GapOverlay {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export function formatUnit(px: number, unit: UnitMode, baseFont = 16): string {
  const rounded = Math.round(px * 100) / 100;
  if (unit === 'rem') {
    const rem = Math.round((rounded / baseFont) * 1000) / 1000;
    return `${rem}rem`;
  }
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}px`;
}

export function formatRadius(radius: number | [number, number, number, number] | undefined, unit: UnitMode): string {
  if (radius === undefined) return '0';
  if (typeof radius === 'number') return formatUnit(radius, unit);
  const [tl, tr, br, bl] = radius;
  if (tl === tr && tr === br && br === bl) return formatUnit(tl, unit);
  return `${formatUnit(tl, unit)} ${formatUnit(tr, unit)} ${formatUnit(br, unit)} ${formatUnit(bl, unit)}`;
}

/**
 * Computes Figma Dev Mode-style redline distance guides between two layers.
 * Handles:
 *  - Child inside Parent (measures all 4 inset distances to container edges)
 *  - Parent containing Child (measures child insets to parent)
 *  - Separate Siblings / Disjoint Layers (measures horizontal & vertical gaps + alignment guides)
 *  - Overlapping Layers (measures edge-to-edge offsets)
 */
export function computeMeasurements(
  selected: InspectLayer,
  target: InspectLayer
): RedlineSegment[] {
  if (selected.id === target.id) return [];

  const a = {
    left: selected.x,
    right: selected.x + selected.width,
    top: selected.y,
    bottom: selected.y + selected.height,
    cx: selected.x + selected.width / 2,
    cy: selected.y + selected.height / 2
  };

  const b = {
    left: target.x,
    right: target.x + target.width,
    top: target.y,
    bottom: target.y + target.height,
    cx: target.x + target.width / 2,
    cy: target.y + target.height / 2
  };

  const aInsideB = a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
  const bInsideA = b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5;

  const lines: RedlineSegment[] = [];

  if (aInsideB || bInsideA) {
    const inner = aInsideB ? a : b;
    const outer = aInsideB ? b : a;

    const topDist = inner.top - outer.top;
    const bottomDist = outer.bottom - inner.bottom;
    const leftDist = inner.left - outer.left;
    const rightDist = outer.right - inner.right;

    if (topDist > 0.5) {
      lines.push({
        id: 'inset-top',
        orientation: 'vertical',
        x1: inner.cx,
        y1: outer.top,
        x2: inner.cx,
        y2: inner.top,
        distance: topDist,
        labelX: inner.cx,
        labelY: outer.top + topDist / 2
      });
    }
    if (bottomDist > 0.5) {
      lines.push({
        id: 'inset-bottom',
        orientation: 'vertical',
        x1: inner.cx,
        y1: inner.bottom,
        x2: inner.cx,
        y2: outer.bottom,
        distance: bottomDist,
        labelX: inner.cx,
        labelY: inner.bottom + bottomDist / 2
      });
    }
    if (leftDist > 0.5) {
      lines.push({
        id: 'inset-left',
        orientation: 'horizontal',
        x1: outer.left,
        y1: inner.cy,
        x2: inner.left,
        y2: inner.cy,
        distance: leftDist,
        labelX: outer.left + leftDist / 2,
        labelY: inner.cy
      });
    }
    if (rightDist > 0.5) {
      lines.push({
        id: 'inset-right',
        orientation: 'horizontal',
        x1: inner.right,
        y1: inner.cy,
        x2: outer.right,
        y2: inner.cy,
        distance: rightDist,
        labelX: inner.right + rightDist / 2,
        labelY: inner.cy
      });
    }
    return lines;
  }

  // Horizontal distance between disjoint boxes
  if (a.right < b.left) {
    const dist = b.left - a.right;
    const overlapTop = Math.max(a.top, b.top);
    const overlapBottom = Math.min(a.bottom, b.bottom);
    const y = overlapTop < overlapBottom ? (overlapTop + overlapBottom) / 2 : a.cy;
    lines.push({
      id: 'gap-right',
      orientation: 'horizontal',
      x1: a.right,
      y1: y,
      x2: b.left,
      y2: y,
      distance: dist,
      labelX: a.right + dist / 2,
      labelY: y,
      guide: overlapTop >= overlapBottom
        ? { x1: b.left, y1: y, x2: b.left, y2: b.top > y ? b.top : b.bottom }
        : undefined
    });
  } else if (b.right < a.left) {
    const dist = a.left - b.right;
    const overlapTop = Math.max(a.top, b.top);
    const overlapBottom = Math.min(a.bottom, b.bottom);
    const y = overlapTop < overlapBottom ? (overlapTop + overlapBottom) / 2 : a.cy;
    lines.push({
      id: 'gap-left',
      orientation: 'horizontal',
      x1: b.right,
      y1: y,
      x2: a.left,
      y2: y,
      distance: dist,
      labelX: b.right + dist / 2,
      labelY: y,
      guide: overlapTop >= overlapBottom
        ? { x1: b.right, y1: y, x2: b.right, y2: b.top > y ? b.top : b.bottom }
        : undefined
    });
  } else {
    // Horizontally overlapping: show left-edge offset if non-zero
    const leftDiff = Math.abs(a.left - b.left);
    if (leftDiff > 0.5) {
      const y = a.top < b.top ? a.bottom : a.top;
      lines.push({
        id: 'offset-x',
        orientation: 'horizontal',
        x1: Math.min(a.left, b.left),
        y1: y,
        x2: Math.max(a.left, b.left),
        y2: y,
        distance: leftDiff,
        labelX: (a.left + b.left) / 2,
        labelY: y
      });
    }
  }

  // Vertical distance between disjoint boxes
  if (a.bottom < b.top) {
    const dist = b.top - a.bottom;
    const overlapLeft = Math.max(a.left, b.left);
    const overlapRight = Math.min(a.right, b.right);
    const x = overlapLeft < overlapRight ? (overlapLeft + overlapRight) / 2 : a.cx;
    lines.push({
      id: 'gap-bottom',
      orientation: 'vertical',
      x1: x,
      y1: a.bottom,
      x2: x,
      y2: b.top,
      distance: dist,
      labelX: x,
      labelY: a.bottom + dist / 2,
      guide: overlapLeft >= overlapRight
        ? { x1: x, y1: b.top, x2: b.left > x ? b.left : b.right, y2: b.top }
        : undefined
    });
  } else if (b.bottom < a.top) {
    const dist = a.top - b.bottom;
    const overlapLeft = Math.max(a.left, b.left);
    const overlapRight = Math.min(a.right, b.right);
    const x = overlapLeft < overlapRight ? (overlapLeft + overlapRight) / 2 : a.cx;
    lines.push({
      id: 'gap-top',
      orientation: 'vertical',
      x1: x,
      y1: b.bottom,
      x2: x,
      y2: a.top,
      distance: dist,
      labelX: x,
      labelY: b.bottom + dist / 2,
      guide: overlapLeft >= overlapRight
        ? { x1: x, y1: b.bottom, x2: b.left > x ? b.left : b.right, y2: b.bottom }
        : undefined
    });
  } else {
    // Vertically overlapping: show top-edge offset if non-zero
    const topDiff = Math.abs(a.top - b.top);
    if (topDiff > 0.5) {
      const x = a.left < b.left ? a.right : a.left;
      lines.push({
        id: 'offset-y',
        orientation: 'vertical',
        x1: x,
        y1: Math.min(a.top, b.top),
        x2: x,
        y2: Math.max(a.top, b.top),
        distance: topDiff,
        labelX: x,
        labelY: (a.top + b.top) / 2
      });
    }
  }

  return lines;
}

export function computePaddingOverlays(layer: InspectLayer): PaddingOverlay[] {
  const al = layer.autoLayout;
  if (!al) return [];
  const list: PaddingOverlay[] = [];
  if (al.paddingTop > 0) {
    list.push({ side: 'top', x: layer.x, y: layer.y, width: layer.width, height: al.paddingTop, value: al.paddingTop });
  }
  if (al.paddingBottom > 0) {
    list.push({
      side: 'bottom',
      x: layer.x,
      y: layer.y + layer.height - al.paddingBottom,
      width: layer.width,
      height: al.paddingBottom,
      value: al.paddingBottom
    });
  }
  if (al.paddingLeft > 0) {
    list.push({
      side: 'left',
      x: layer.x,
      y: layer.y + al.paddingTop,
      width: al.paddingLeft,
      height: Math.max(0, layer.height - al.paddingTop - al.paddingBottom),
      value: al.paddingLeft
    });
  }
  if (al.paddingRight > 0) {
    list.push({
      side: 'right',
      x: layer.x + layer.width - al.paddingRight,
      y: layer.y + al.paddingTop,
      width: al.paddingRight,
      height: Math.max(0, layer.height - al.paddingTop - al.paddingBottom),
      value: al.paddingRight
    });
  }
  return list;
}

/** Computes Figma Dev Mode Auto Layout gap bands between consecutive visible children */
export function computeGapOverlays(layer: InspectLayer): GapOverlay[] {
  const al = layer.autoLayout;
  if (!al || !al.gap || al.gap <= 0 || !layer.children || layer.children.length < 2) return [];
  const visible = layer.children.filter(c => c.visible !== false);
  if (visible.length < 2) return [];

  const sorted = [...visible].sort((a, b) =>
    al.direction === 'HORIZONTAL' ? a.x - b.x : a.y - b.y
  );

  const gaps: GapOverlay[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (al.direction === 'HORIZONTAL') {
      const startX = cur.x + cur.width;
      const dist = next.x - startX;
      if (dist > 0.5) {
        const top = Math.min(cur.y, next.y);
        const bottom = Math.max(cur.y + cur.height, next.y + next.height);
        gaps.push({
          id: `gap-h-${i}`,
          x: startX,
          y: top,
          width: dist,
          height: Math.max(8, bottom - top),
          value: Math.round(dist * 10) / 10
        });
      }
    } else {
      const startY = cur.y + cur.height;
      const dist = next.y - startY;
      if (dist > 0.5) {
        const left = Math.min(cur.x, next.x);
        const right = Math.max(cur.x + cur.width, next.x + next.width);
        gaps.push({
          id: `gap-v-${i}`,
          x: left,
          y: startY,
          width: Math.max(8, right - left),
          height: dist,
          value: Math.round(dist * 10) / 10
        });
      }
    }
  }
  return gaps;
}

/** Returns ancestor chain [root, ..., selected] for Figma canvas breadcrumb trail */
export function getLayerBreadcrumbs(root: InspectLayer, id: string): InspectLayer[] {
  const path: InspectLayer[] = [];
  function dfs(node: InspectLayer): boolean {
    path.push(node);
    if (node.id === id) return true;
    if (node.children) {
      for (const child of node.children) {
        if (dfs(child)) return true;
      }
    }
    path.pop();
    return false;
  }
  dfs(root);
  return path.length ? path : [root];
}

export function flattenLayers(root: InspectLayer): InspectLayer[] {
  const out: InspectLayer[] = [];
  function walk(node: InspectLayer) {
    if (node.visible === false) return;
    out.push(node);
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  return out;
}

export function findLayerById(root: InspectLayer, id: string): InspectLayer | null {
  if (root.id === id) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    const hit = findLayerById(child, id);
    if (hit) return hit;
  }
  return null;
}

export function findParentMap(root: InspectLayer): Map<string, InspectLayer> {
  const map = new Map<string, InspectLayer>();
  function walk(node: InspectLayer) {
    if (!node.children) return;
    for (const c of node.children) {
      map.set(c.id, node);
      walk(c);
    }
  }
  walk(root);
  return map;
}

/** Hit-test full layer stack [root, ..., leaf] at artboard coordinates (ax, ay) */
export function hitTestLayerStack(root: InspectLayer, ax: number, ay: number): InspectLayer[] {
  if (root.visible === false) return [];
  const inside = ax >= root.x && ax <= root.x + root.width && ay >= root.y && ay <= root.y + root.height;
  if (!inside && root.clipsContent) return [];

  if (root.children) {
    for (let i = root.children.length - 1; i >= 0; i--) {
      const childStack = hitTestLayerStack(root.children[i], ax, ay);
      if (childStack.length > 0) {
        return [root, ...childStack];
      }
    }
  }
  return inside ? [root] : [];
}

/** Hit-test deepest visible layer at artboard coordinates (ax, ay) */
export function hitTestLayer(root: InspectLayer, ax: number, ay: number): InspectLayer | null {
  const stack = hitTestLayerStack(root, ax, ay);
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * Figma Dev Mode smart hit-testing:
 * - If `deep` is true (holding ⌘/Ctrl or double-click), returns deepest leaf layer.
 * - Otherwise, stops at the top-most component/instance unless the user is already
 *   inspecting a layer inside that component (drilled in).
 */
export function hitTestLayerSmart(
  root: InspectLayer,
  ax: number,
  ay: number,
  opts: { deep: boolean; currentSelectedId?: string }
): InspectLayer | null {
  const stack = hitTestLayerStack(root, ax, ay);
  if (stack.length === 0) return null;
  if (opts.deep || stack.length <= 2) return stack[stack.length - 1];

  // Check if a component/instance exists below root
  const compIdx = stack.findIndex(
    (n, idx) => idx > 0 && Boolean(n.componentName || n.type === 'COMPONENT' || n.type === 'INSTANCE')
  );
  if (compIdx === -1) return stack[stack.length - 1];

  const compNode = stack[compIdx];
  // If user already selected a descendant of this component, allow selecting nested children freely
  if (opts.currentSelectedId && opts.currentSelectedId !== compNode.id) {
    if (findLayerById(compNode, opts.currentSelectedId)) {
      return stack[stack.length - 1];
    }
  }
  return compNode;
}
