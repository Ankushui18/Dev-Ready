import type { InspectLayer, UnitMode } from '../types';

export type LayerDiffStatus = 'edited' | 'added' | 'deleted' | 'unchanged';
export type DiffCodeLang = 'css' | 'tailwind' | 'swiftui' | 'compose';

export interface PropertyDiff {
  category: 'layout' | 'style' | 'typography' | 'content';
  property: string;
  before?: string;
  after?: string;
  beforeColor?: string;
  afterColor?: string;
}

export interface LayerDiffEntry {
  id: string;
  name: string;
  type: InspectLayer['type'];
  status: LayerDiffStatus;
  before?: InspectLayer;
  after?: InspectLayer;
  changes: PropertyDiff[];
}

export interface DiffCodeLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
  swatch?: string;
}

export interface DiffCodeCards {
  layout: DiffCodeLine[];
  style: DiffCodeLine[];
}

function flattenTree(root: InspectLayer): Map<string, InspectLayer> {
  const map = new Map<string, InspectLayer>();
  const walk = (n: InspectLayer) => {
    map.set(n.id, n);
    n.children?.forEach(walk);
  };
  walk(root);
  return map;
}

function fmtNum(v: number, unit: UnitMode): string {
  const r = Math.round(v * 100) / 100;
  if (unit === 'rem') return `${Math.round((r / 16) * 1000) / 1000}rem`;
  return `${r}px`;
}

function fmtRadius(r?: number | [number, number, number, number], unit: UnitMode = 'px'): string | undefined {
  if (r === undefined) return undefined;
  if (Array.isArray(r)) {
    if (r.every(v => v === 0)) return undefined;
    return r.map(v => fmtNum(v, unit)).join(' ');
  }
  return r > 0 ? fmtNum(r, unit) : undefined;
}

function fmtPadding(al?: InspectLayer['autoLayout'], unit: UnitMode = 'px'): string | undefined {
  if (!al) return undefined;
  const { paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l } = al;
  if (t === 0 && r === 0 && b === 0 && l === 0) return undefined;
  if (t === r && r === b && b === l) return fmtNum(t, unit);
  if (t === b && l === r) return `${fmtNum(t, unit)} ${fmtNum(r, unit)}`;
  return `${fmtNum(t, unit)} ${fmtNum(r, unit)} ${fmtNum(b, unit)} ${fmtNum(l, unit)}`;
}

function primaryFillValue(layer?: InspectLayer): { text?: string; color?: string } {
  const f = layer?.fills?.[0];
  if (!f) return {};
  if (f.type === 'LINEAR_GRADIENT' && f.gradient) return { text: f.gradient };
  if (f.color) {
    const label = f.token ? `var(${f.token}, ${f.color})` : f.color;
    return { text: label, color: f.color };
  }
  return {};
}

function primaryStrokeValue(layer?: InspectLayer, unit: UnitMode = 'px'): { text?: string; color?: string } {
  const s = layer?.strokes?.[0];
  if (!s) return {};
  const colorPart = s.token ? `var(${s.token}, ${s.color})` : s.color;
  return { text: `${fmtNum(s.width, unit)} solid ${colorPart}`, color: s.color };
}

function primaryShadowValue(layer?: InspectLayer): string | undefined {
  const e = layer?.effects?.find(x => x.type === 'DROP_SHADOW');
  if (!e) return undefined;
  return `${e.x || 0}px ${e.y || 0}px ${e.blur}px ${e.spread || 0}px ${e.color || 'rgba(0,0,0,0.12)'}`;
}

export function diffLayerProperties(
  before: InspectLayer | undefined,
  after: InspectLayer | undefined,
  unit: UnitMode = 'px'
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];

  const push = (
    category: PropertyDiff['category'],
    property: string,
    bVal?: string,
    aVal?: string,
    bColor?: string,
    aColor?: string
  ) => {
    if ((bVal ?? '') === (aVal ?? '')) return;
    diffs.push({ category, property, before: bVal, after: aVal, beforeColor: bColor, afterColor: aColor });
  };

  if (before && after) {
    if (Math.round(before.width) !== Math.round(after.width)) {
      push('layout', 'Width', fmtNum(before.width, unit), fmtNum(after.width, unit));
    }
    if (Math.round(before.height) !== Math.round(after.height)) {
      push('layout', 'Height', fmtNum(before.height, unit), fmtNum(after.height, unit));
    }
    push('layout', 'Padding', fmtPadding(before.autoLayout, unit), fmtPadding(after.autoLayout, unit));
    if (before.autoLayout?.gap !== after.autoLayout?.gap) {
      push(
        'layout',
        'Gap',
        before.autoLayout ? fmtNum(before.autoLayout.gap, unit) : undefined,
        after.autoLayout ? fmtNum(after.autoLayout.gap, unit) : undefined
      );
    }
    if (before.autoLayout?.direction !== after.autoLayout?.direction) {
      push('layout', 'Direction', before.autoLayout?.direction, after.autoLayout?.direction);
    }

    const bf = primaryFillValue(before);
    const af = primaryFillValue(after);
    push(
      'style',
      after.type === 'TEXT' ? 'Color' : 'Background',
      bf.text,
      af.text,
      bf.color,
      af.color
    );

    const bs = primaryStrokeValue(before, unit);
    const as = primaryStrokeValue(after, unit);
    push('style', 'Border', bs.text, as.text, bs.color, as.color);

    push('style', 'Border radius', fmtRadius(before.radius, unit), fmtRadius(after.radius, unit));
    push('style', 'Box shadow', primaryShadowValue(before), primaryShadowValue(after));

    const bOp = before.opacity ?? 1;
    const aOp = after.opacity ?? 1;
    if (bOp !== aOp) {
      push('style', 'Opacity', `${Math.round(bOp * 100)}%`, `${Math.round(aOp * 100)}%`);
    }

    if (before.typography || after.typography) {
      if (before.typography?.fontSize !== after.typography?.fontSize) {
        push(
          'typography',
          'Font size',
          before.typography ? fmtNum(before.typography.fontSize, unit) : undefined,
          after.typography ? fmtNum(after.typography.fontSize, unit) : undefined
        );
      }
      if (before.typography?.fontWeight !== after.typography?.fontWeight) {
        push(
          'typography',
          'Font weight',
          before.typography ? String(before.typography.fontWeight) : undefined,
          after.typography ? String(after.typography.fontWeight) : undefined
        );
      }
      if (before.typography?.lineHeight !== after.typography?.lineHeight) {
        push(
          'typography',
          'Line height',
          before.typography ? fmtNum(before.typography.lineHeight, unit) : undefined,
          after.typography ? fmtNum(after.typography.lineHeight, unit) : undefined
        );
      }
    }

    if ((before.text ?? '') !== (after.text ?? '')) {
      push('content', 'Text', before.text, after.text);
    }
  } else if (after && !before) {
    push('layout', 'Size', undefined, `${fmtNum(after.width, unit)} × ${fmtNum(after.height, unit)}`);
    const af = primaryFillValue(after);
    if (af.text) push('style', after.type === 'TEXT' ? 'Color' : 'Background', undefined, af.text, undefined, af.color);
    const ar = fmtRadius(after.radius, unit);
    if (ar) push('style', 'Border radius', undefined, ar);
    if (after.text) push('content', 'Text', undefined, after.text);
  } else if (before && !after) {
    push('layout', 'Size', `${fmtNum(before.width, unit)} × ${fmtNum(before.height, unit)}`, undefined);
    const bf = primaryFillValue(before);
    if (bf.text) push('style', before.type === 'TEXT' ? 'Color' : 'Background', bf.text, undefined, bf.color, undefined);
    if (before.text) push('content', 'Text', before.text, undefined);
  }

  return diffs;
}

export function diffLayerTrees(
  beforeRoot: InspectLayer,
  afterRoot: InspectLayer,
  unit: UnitMode = 'px'
): LayerDiffEntry[] {
  const beforeMap = flattenTree(beforeRoot);
  const afterMap = flattenTree(afterRoot);
  const seen = new Set<string>();
  const entries: LayerDiffEntry[] = [];

  for (const [id, afterLayer] of afterMap.entries()) {
    seen.add(id);
    const beforeLayer = beforeMap.get(id);
    if (!beforeLayer) {
      entries.push({
        id,
        name: afterLayer.name,
        type: afterLayer.type,
        status: 'added',
        after: afterLayer,
        changes: diffLayerProperties(undefined, afterLayer, unit)
      });
    } else {
      const changes = diffLayerProperties(beforeLayer, afterLayer, unit);
      entries.push({
        id,
        name: afterLayer.name,
        type: afterLayer.type,
        status: changes.length > 0 ? 'edited' : 'unchanged',
        before: beforeLayer,
        after: afterLayer,
        changes
      });
    }
  }

  for (const [id, beforeLayer] of beforeMap.entries()) {
    if (seen.has(id)) continue;
    entries.push({
      id,
      name: beforeLayer.name,
      type: beforeLayer.type,
      status: 'deleted',
      before: beforeLayer,
      changes: diffLayerProperties(beforeLayer, undefined, unit)
    });
  }

  return entries;
}

interface RawLine {
  key: string;
  text: string;
  swatch?: string;
}

function buildSectionLines(layer: InspectLayer | undefined, lang: DiffCodeLang, unit: UnitMode): {
  layout: RawLine[];
  style: RawLine[];
} {
  if (!layer) return { layout: [], style: [] };
  const layout: RawLine[] = [];
  const style: RawLine[] = [];

  const w = fmtNum(layer.width, unit);
  const h = fmtNum(layer.height, unit);
  const pad = fmtPadding(layer.autoLayout, unit);
  const rad = fmtRadius(layer.radius, unit);
  const fill = primaryFillValue(layer);
  const stroke = primaryStrokeValue(layer, unit);
  const shadow = primaryShadowValue(layer);

  if (lang === 'css') {
    if (layer.autoLayout) {
      layout.push({ key: 'display', text: 'display: flex;' });
      if (layer.autoLayout.direction === 'VERTICAL') {
        layout.push({ key: 'dir', text: 'flex-direction: column;' });
      }
      if (pad) layout.push({ key: 'padding', text: `padding: ${pad};` });
      if (layer.autoLayout.gap > 0) {
        layout.push({ key: 'gap', text: `gap: ${fmtNum(layer.autoLayout.gap, unit)};` });
      }
    }
    layout.push({ key: 'width', text: `width: ${w};` });
    layout.push({ key: 'height', text: `height: ${h};` });

    if (rad) style.push({ key: 'radius', text: `border-radius: ${rad};` });
    if (stroke.text) style.push({ key: 'border', text: `border: ${stroke.text};`, swatch: stroke.color });
    if (fill.text) {
      style.push({
        key: 'fill',
        text: `${layer.type === 'TEXT' ? 'color' : 'background'}: ${fill.text};`,
        swatch: fill.color
      });
    }
    if (shadow) style.push({ key: 'shadow', text: `box-shadow: ${shadow};` });
    if (layer.opacity !== undefined && layer.opacity < 1) {
      style.push({ key: 'opacity', text: `opacity: ${layer.opacity};` });
    }
    if (layer.typography) {
      style.push({ key: 'font-size', text: `font-size: ${fmtNum(layer.typography.fontSize, unit)};` });
      style.push({ key: 'font-weight', text: `font-weight: ${layer.typography.fontWeight};` });
      style.push({ key: 'line-height', text: `line-height: ${fmtNum(layer.typography.lineHeight, unit)};` });
    }
    if (layer.text) {
      style.push({ key: 'content', text: `/* text: "${layer.text}" */` });
    }
  } else if (lang === 'tailwind') {
    if (layer.autoLayout) {
      layout.push({
        key: 'display',
        text: layer.autoLayout.direction === 'VERTICAL' ? 'flex flex-col' : 'flex flex-row'
      });
      if (pad) layout.push({ key: 'padding', text: `p-[${pad.replace(/\s+/g, '_')}]` });
      if (layer.autoLayout.gap > 0) layout.push({ key: 'gap', text: `gap-[${fmtNum(layer.autoLayout.gap, unit)}]` });
    }
    layout.push({ key: 'width', text: `w-[${w}]` });
    layout.push({ key: 'height', text: `h-[${h}]` });

    if (rad) style.push({ key: 'radius', text: `rounded-[${rad.replace(/\s+/g, '_')}]` });
    if (stroke.color) style.push({ key: 'border', text: `border border-[${stroke.color}]`, swatch: stroke.color });
    if (fill.color) {
      style.push({
        key: 'fill',
        text: `${layer.type === 'TEXT' ? 'text' : 'bg'}-[${fill.color}]`,
        swatch: fill.color
      });
    }
    if (layer.typography) {
      style.push({ key: 'font-size', text: `text-[${fmtNum(layer.typography.fontSize, unit)}]` });
      style.push({ key: 'font-weight', text: `font-[${layer.typography.fontWeight}]` });
    }
    if (layer.text) style.push({ key: 'content', text: `// "${layer.text}"` });
  } else if (lang === 'swiftui') {
    if (layer.autoLayout) {
      const stack = layer.autoLayout.direction === 'VERTICAL' ? 'VStack' : 'HStack';
      layout.push({ key: 'display', text: `${stack}(spacing: ${layer.autoLayout.gap})` });
      if (pad) layout.push({ key: 'padding', text: `.padding(${layer.autoLayout.paddingTop})` });
    }
    layout.push({ key: 'width', text: `.frame(width: ${Math.round(layer.width)}, height: ${Math.round(layer.height)})` });
    if (fill.color) {
      style.push({
        key: 'fill',
        text: `${layer.type === 'TEXT' ? '.foregroundColor' : '.background'}(Color(hex: "${fill.color}"))`,
        swatch: fill.color
      });
    }
    if (rad) {
      const rNum = Array.isArray(layer.radius) ? layer.radius[0] : layer.radius || 0;
      style.push({ key: 'radius', text: `.cornerRadius(${rNum})` });
    }
    if (layer.typography) {
      style.push({ key: 'font-size', text: `.font(.system(size: ${layer.typography.fontSize}, weight: .w${layer.typography.fontWeight}))` });
    }
    if (layer.text) style.push({ key: 'content', text: `Text("${layer.text}")` });
  } else {
    // compose
    if (layer.autoLayout) {
      const box = layer.autoLayout.direction === 'VERTICAL' ? 'Column' : 'Row';
      layout.push({ key: 'display', text: `${box}(Arrangement.spacedBy(${layer.autoLayout.gap}.dp))` });
      if (pad) layout.push({ key: 'padding', text: `.padding(${layer.autoLayout.paddingTop}.dp)` });
    }
    layout.push({ key: 'width', text: `.size(width = ${Math.round(layer.width)}.dp, height = ${Math.round(layer.height)}.dp)` });
    if (fill.color) {
      style.push({
        key: 'fill',
        text: `${layer.type === 'TEXT' ? 'color =' : '.background('} Color(0xFF${fill.color.replace('#', '')})${layer.type === 'TEXT' ? '' : ')'}`,
        swatch: fill.color
      });
    }
    if (rad) {
      const rNum = Array.isArray(layer.radius) ? layer.radius[0] : layer.radius || 0;
      style.push({ key: 'radius', text: `.clip(RoundedCornerShape(${rNum}.dp))` });
    }
    if (layer.typography) {
      style.push({ key: 'font-size', text: `fontSize = ${layer.typography.fontSize}.sp` });
      style.push({ key: 'font-weight', text: `fontWeight = FontWeight(${layer.typography.fontWeight})` });
    }
    if (layer.text) style.push({ key: 'content', text: `text = "${layer.text}"` });
  }

  return { layout, style };
}

function mergeDiffLines(beforeLines: RawLine[], afterLines: RawLine[]): DiffCodeLine[] {
  const beforeMap = new Map(beforeLines.map(l => [l.key, l]));
  const afterMap = new Map(afterLines.map(l => [l.key, l]));
  const orderedKeys: string[] = [];
  for (const l of beforeLines) if (!orderedKeys.includes(l.key)) orderedKeys.push(l.key);
  for (const l of afterLines) if (!orderedKeys.includes(l.key)) orderedKeys.push(l.key);

  const out: DiffCodeLine[] = [];
  for (const key of orderedKeys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (b && a) {
      if (b.text === a.text) {
        out.push({ kind: 'same', text: a.text, swatch: a.swatch });
      } else {
        out.push({ kind: 'removed', text: b.text, swatch: b.swatch });
        out.push({ kind: 'added', text: a.text, swatch: a.swatch });
      }
    } else if (b && !a) {
      out.push({ kind: 'removed', text: b.text, swatch: b.swatch });
    } else if (a && !b) {
      out.push({ kind: 'added', text: a.text, swatch: a.swatch });
    }
  }
  return out;
}

export function buildLayerDiffCards(
  before: InspectLayer | undefined,
  after: InspectLayer | undefined,
  lang: DiffCodeLang,
  unit: UnitMode
): DiffCodeCards {
  const b = buildSectionLines(before, lang, unit);
  const a = buildSectionLines(after, lang, unit);
  return {
    layout: mergeDiffLines(b.layout, a.layout),
    style: mergeDiffLines(b.style, a.style)
  };
}
