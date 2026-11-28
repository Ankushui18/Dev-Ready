import type { CodeTarget, DevReadyBundle, InspectLayer, TokenEntry, UnitMode } from '../types';
import { formatRadius, formatUnit } from './measure';

export const CODE_TARGETS: Array<{ id: CodeTarget; label: string; ext: string; group: string }> = [
  { id: 'react-tailwind-ts', label: 'React + TS + Tailwind', ext: 'tsx', group: 'Web' },
  { id: 'react-tailwind', label: 'React + Tailwind', ext: 'jsx', group: 'Web' },
  { id: 'react-css', label: 'React + CSS', ext: 'tsx', group: 'Web' },
  { id: 'html-css', label: 'HTML + CSS', ext: 'html', group: 'Web' },
  { id: 'vue', label: 'Vue 3 SFC', ext: 'vue', group: 'Web' },
  { id: 'svelte', label: 'Svelte', ext: 'svelte', group: 'Web' },
  { id: 'tailwind', label: 'Tailwind Classes', ext: 'txt', group: 'Snippets' },
  { id: 'css', label: 'CSS Properties', ext: 'css', group: 'Snippets' },
  { id: 'react-native', label: 'React Native', ext: 'tsx', group: 'Mobile' },
  { id: 'swiftui', label: 'SwiftUI', ext: 'swift', group: 'Mobile' },
  { id: 'compose', label: 'Jetpack Compose', ext: 'kt', group: 'Mobile' },
  { id: 'flutter', label: 'Flutter (Dart)', ext: 'dart', group: 'Mobile' }
];

function toPascal(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return cleaned && /^[A-Z]/.test(cleaned) ? cleaned : 'Component' + cleaned;
}

function toKebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'layer';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function primaryFillCss(layer: InspectLayer): string | null {
  const f = layer.fills?.[0];
  if (!f) return null;
  if (f.type === 'LINEAR_GRADIENT' && f.gradient) return f.gradient;
  if (f.type === 'SOLID' && f.color) {
    if (f.opacity !== undefined && f.opacity < 0.99) {
      const hex = f.color.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${Math.round(f.opacity * 100) / 100})`;
      }
    }
    return f.color;
  }
  return null;
}

function shadowCss(layer: InspectLayer): string | null {
  const shadows = (layer.effects || []).filter(e => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
  if (!shadows.length) return null;
  return shadows
    .map(s => `${s.type === 'INNER_SHADOW' ? 'inset ' : ''}${s.x || 0}px ${s.y || 0}px ${s.blur}px ${s.spread || 0}px ${s.color || 'rgba(0,0,0,0.18)'}`)
    .join(', ');
}

export function layerToCssMap(layer: InspectLayer, unit: UnitMode): Array<[string, string]> {
  const props: Array<[string, string]> = [];
  if (layer.autoLayout) {
    const al = layer.autoLayout;
    props.push(['display', 'flex']);
    props.push(['flex-direction', al.direction === 'HORIZONTAL' ? 'row' : 'column']);
    if (al.alignItems && al.alignItems !== 'STRETCH') {
      const map = { START: 'flex-start', CENTER: 'center', END: 'flex-end', STRETCH: 'stretch' };
      props.push(['align-items', map[al.alignItems]]);
    }
    if (al.justifyContent && al.justifyContent !== 'START') {
      const map = { START: 'flex-start', CENTER: 'center', END: 'flex-end', SPACE_BETWEEN: 'space-between' };
      props.push(['justify-content', map[al.justifyContent]]);
    }
    if (al.gap > 0) props.push(['gap', formatUnit(al.gap, unit)]);
    const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = al;
    if (pt || pr || pb || pl) {
      if (pt === pr && pr === pb && pb === pl) props.push(['padding', formatUnit(pt, unit)]);
      else if (pt === pb && pl === pr) props.push(['padding', `${formatUnit(pt, unit)} ${formatUnit(pr, unit)}`]);
      else props.push(['padding', `${formatUnit(pt, unit)} ${formatUnit(pr, unit)} ${formatUnit(pb, unit)} ${formatUnit(pl, unit)}`]);
    }
  }

  props.push(['width', formatUnit(layer.width, unit)]);
  if (layer.type !== 'TEXT') props.push(['height', formatUnit(layer.height, unit)]);

  const fill = primaryFillCss(layer);
  if (fill) {
    if (layer.type === 'TEXT') props.push(['color', fill]);
    else if (fill.startsWith('linear-gradient')) props.push(['background', fill]);
    else props.push(['background-color', fill]);
  }

  if (layer.strokes?.[0]) {
    const s = layer.strokes[0];
    props.push(['border', `${formatUnit(s.width, unit)} ${s.dash ? 'dashed' : 'solid'} ${s.color}`]);
  }

  if (layer.radius !== undefined && layer.radius !== 0) {
    props.push(['border-radius', formatRadius(layer.radius, unit)]);
  }

  if (layer.opacity !== undefined && layer.opacity < 0.99) {
    props.push(['opacity', String(Math.round(layer.opacity * 100) / 100)]);
  }

  const sh = shadowCss(layer);
  if (sh) props.push(['box-shadow', sh]);

  if (layer.typography) {
    const t = layer.typography;
    props.push(['font-family', `'${t.fontFamily}', sans-serif`]);
    props.push(['font-size', formatUnit(t.fontSize, unit)]);
    props.push(['font-weight', String(t.fontWeight)]);
    props.push(['line-height', formatUnit(t.lineHeight, unit)]);
    if (t.letterSpacing) props.push(['letter-spacing', formatUnit(t.letterSpacing, unit)]);
    if (t.textAlign && t.textAlign !== 'LEFT') props.push(['text-align', t.textAlign.toLowerCase()]);
  }

  if (layer.clipsContent) props.push(['overflow', 'hidden']);
  return props;
}

function pxToTwSpacing(px: number): string {
  const map: Record<number, string> = {
    0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5', 12: '3',
    14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8', 36: '9',
    40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20', 96: '24'
  };
  return map[Math.round(px)] ?? `[${Math.round(px)}px]`;
}

function twColorToken(hex: string, prefix: 'bg' | 'text' | 'border', opacity?: number): string {
  const norm = hex.trim().toUpperCase();
  const op = opacity !== undefined && opacity < 0.99 ? `/${Math.round(opacity * 100)}` : '';
  if (norm === '#FFFFFF' || norm === '#FFF') return `${prefix}-white${op}`;
  if (norm === '#000000' || norm === '#000') return `${prefix}-black${op}`;
  return `${prefix}-[${norm}]${op}`;
}

function twFontSize(px: number): string {
  const map: Record<number, string> = {
    12: 'text-xs', 14: 'text-sm', 16: 'text-base', 18: 'text-lg',
    20: 'text-xl', 24: 'text-2xl', 30: 'text-3xl', 36: 'text-4xl', 48: 'text-5xl'
  };
  return map[Math.round(px)] ?? `text-[${Math.round(px)}px]`;
}

function twLineHeight(px: number): string {
  const map: Record<number, string> = {
    12: 'leading-3', 16: 'leading-4', 20: 'leading-5', 24: 'leading-6',
    28: 'leading-7', 32: 'leading-8', 36: 'leading-9', 40: 'leading-10'
  };
  return map[Math.round(px)] ?? `leading-[${Math.round(px)}px]`;
}

function twRadius(r: number): string {
  if (r >= 999) return 'rounded-full';
  const map: Record<number, string> = {
    2: 'rounded-sm', 4: 'rounded', 6: 'rounded-md', 8: 'rounded-lg',
    12: 'rounded-xl', 16: 'rounded-2xl', 24: 'rounded-3xl'
  };
  return map[Math.round(r)] ?? `rounded-[${Math.round(r)}px]`;
}

export function layerToTailwind(layer: InspectLayer): string {
  const cls: string[] = [];
  if (layer.autoLayout) {
    const al = layer.autoLayout;
    cls.push('flex', al.direction === 'HORIZONTAL' ? 'flex-row' : 'flex-col');
    if (al.wrap) cls.push('flex-wrap');
    if (al.alignItems === 'CENTER') cls.push('items-center');
    else if (al.alignItems === 'END') cls.push('items-end');
    else if (al.alignItems === 'START') cls.push('items-start');
    else if (al.alignItems === 'STRETCH') cls.push('items-stretch');

    if (al.justifyContent === 'CENTER') cls.push('justify-center');
    else if (al.justifyContent === 'SPACE_BETWEEN') cls.push('justify-between');
    else if (al.justifyContent === 'END') cls.push('justify-end');

    if (al.gap > 0) cls.push(`gap-${pxToTwSpacing(al.gap)}`);
    const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = al;
    if (pt === pr && pr === pb && pb === pl && pt > 0) cls.push(`p-${pxToTwSpacing(pt)}`);
    else {
      if (pt === pb && pt > 0) cls.push(`py-${pxToTwSpacing(pt)}`);
      else {
        if (pt > 0) cls.push(`pt-${pxToTwSpacing(pt)}`);
        if (pb > 0) cls.push(`pb-${pxToTwSpacing(pb)}`);
      }
      if (pl === pr && pl > 0) cls.push(`px-${pxToTwSpacing(pl)}`);
      else {
        if (pl > 0) cls.push(`pl-${pxToTwSpacing(pl)}`);
        if (pr > 0) cls.push(`pr-${pxToTwSpacing(pr)}`);
      }
    }
  }

  // Only emit explicit width/height when meaningful (skip fixed width on single-line text labels)
  if (layer.type !== 'TEXT') {
    cls.push(`w-[${Math.round(layer.width)}px]`, `h-[${Math.round(layer.height)}px]`);
  }

  const fill = layer.fills?.[0];
  if (fill?.type === 'SOLID' && fill.color) {
    cls.push(twColorToken(fill.color, layer.type === 'TEXT' ? 'text' : 'bg', fill.opacity));
  } else if (fill?.type === 'LINEAR_GRADIENT' && fill.gradient) {
    cls.push(`bg-[${fill.gradient.replace(/\s+/g, '_')}]`);
  }

  if (layer.strokes?.[0]) {
    const s = layer.strokes[0];
    cls.push(s.width === 1 ? 'border' : `border-[${s.width}px]`);
    if (s.dash) cls.push('border-dashed');
    cls.push(twColorToken(s.color, 'border'));
  }

  if (typeof layer.radius === 'number' && layer.radius > 0) {
    cls.push(twRadius(layer.radius));
  } else if (Array.isArray(layer.radius) && layer.radius.some(v => v > 0)) {
    const [tl, tr, br, bl] = layer.radius;
    if (tl === tr && br === 0 && bl === 0) cls.push(twRadius(tl).replace('rounded', 'rounded-t'));
    else if (bl === br && tl === 0 && tr === 0) cls.push(twRadius(bl).replace('rounded', 'rounded-b'));
    else cls.push(`rounded-[${layer.radius.map(v => `${Math.round(v)}px`).join('_')}]`);
  }

  if (layer.opacity !== undefined && layer.opacity < 0.99) {
    const pct = Math.round(layer.opacity * 100);
    const stdOp = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
    cls.push(stdOp.includes(pct) ? `opacity-${pct}` : `opacity-[${Math.round(layer.opacity * 100) / 100}]`);
  }

  if (layer.typography) {
    const t = layer.typography;
    cls.push(twFontSize(t.fontSize), twLineHeight(t.lineHeight));
    const wMap: Record<number, string> = {
      100: 'font-thin', 200: 'font-extralight', 300: 'font-light',
      400: 'font-normal', 500: 'font-medium', 600: 'font-semibold',
      700: 'font-bold', 800: 'font-extrabold', 900: 'font-black'
    };
    cls.push(wMap[t.fontWeight] || `font-[${t.fontWeight}]`);
    if (t.letterSpacing) cls.push(`tracking-[${t.letterSpacing}px]`);
    if (t.textAlign === 'CENTER') cls.push('text-center');
    else if (t.textAlign === 'RIGHT') cls.push('text-right');
    if (t.textTransform === 'UPPERCASE') cls.push('uppercase');
    else if (t.textTransform === 'LOWERCASE') cls.push('lowercase');
    else if (t.textTransform === 'CAPITALIZE') cls.push('capitalize');
  }

  if (layer.effects?.some(e => e.type === 'DROP_SHADOW')) cls.push('shadow-md');
  if (layer.effects?.some(e => e.type === 'BACKGROUND_BLUR')) cls.push('backdrop-blur-md');
  if (layer.clipsContent) cls.push('overflow-hidden');

  return cls.join(' ');
}

function semanticTag(layer: InspectLayer): string {
  const n = layer.name.toLowerCase();
  if (layer.type === 'TEXT') {
    const fs = layer.typography?.fontSize || 14;
    if (fs >= 28) return 'h1';
    if (fs >= 20) return 'h2';
    if (fs >= 17) return 'h3';
    if ((layer.text || '').length > 55) return 'p';
    return 'span';
  }
  if (layer.interactive || /\b(button|btn|cta)\b/.test(n)) return 'button';
  if (/\b(header|topbar|appbar)\b/.test(n)) return 'header';
  if (/\b(nav|navbar|sidebar|tabbar)\b/.test(n)) return 'nav';
  if (/\b(footer)\b/.test(n)) return 'footer';
  return 'div';
}

function renderJsxTree(layer: InspectLayer, depth: number, useTw: boolean): string {
  const indent = '  '.repeat(depth);
  const tag = semanticTag(layer);
  const typeAttr = tag === 'button' ? ' type="button"' : '';

  const attr = useTw
    ? `className="${layerToTailwind(layer)}"`
    : `className="${toKebab(layer.name)}"`;

  if (layer.type === 'TEXT') {
    return `${indent}<${tag} ${attr}>${escapeHtml(layer.text || layer.name)}</${tag}>`;
  }
  if (layer.svg) {
    return `${indent}<div ${attr} aria-label="${escapeHtml(layer.name)}">\n${indent}  {/* SVG icon: ${layer.name} (${Math.round(layer.width)}×${Math.round(layer.height)}) */}\n${indent}</div>`;
  }
  if (!layer.children || layer.children.length === 0) {
    return `${indent}<${tag}${typeAttr} ${attr} />`;
  }
  const kids = layer.children.slice(0, 24).map(c => renderJsxTree(c, depth + 1, useTw)).join('\n');
  return `${indent}<${tag}${typeAttr} ${attr}>\n${kids}\n${indent}</${tag}>`;
}

function collectCssRules(layer: InspectLayer, unit: UnitMode, out: string[], seen: Set<string>) {
  const base = toKebab(layer.name);
  let cls = base;
  let n = 2;
  while (seen.has(cls)) cls = `${base}-${n++}`;
  seen.add(cls);

  const props = layerToCssMap(layer, unit)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  out.push(`.${cls} {\n${props}\n}`);
  layer.children?.slice(0, 24).forEach(c => collectCssRules(c, unit, out, seen));
}

function hexToSwiftColor(hex: string): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return 'Color.primary';
  const r = (parseInt(c.slice(0, 2), 16) / 255).toFixed(3);
  const g = (parseInt(c.slice(2, 4), 16) / 255).toFixed(3);
  const b = (parseInt(c.slice(4, 6), 16) / 255).toFixed(3);
  return `Color(red: ${r}, green: ${g}, blue: ${b})`;
}

function renderSwiftUI(layer: InspectLayer, depth: number): string {
  const ind = '  '.repeat(depth);
  if (layer.type === 'TEXT') {
    const t = layer.typography;
    const fill = layer.fills?.[0]?.color;
    const lines = [`${ind}Text("${(layer.text || layer.name).replace(/"/g, '\\"')}")`];
    if (t) lines.push(`${ind}  .font(.system(size: ${t.fontSize}, weight: .${t.fontWeight >= 700 ? 'bold' : t.fontWeight >= 600 ? 'semibold' : t.fontWeight >= 500 ? 'medium' : 'regular'}))`);
    if (fill) lines.push(`${ind}  .foregroundStyle(${hexToSwiftColor(fill)})`);
    return lines.join('\n');
  }
  const stack = layer.autoLayout?.direction === 'HORIZONTAL' ? 'HStack' : 'VStack';
  const gap = layer.autoLayout?.gap ?? 0;
  const kids = (layer.children || []).slice(0, 14).map(c => renderSwiftUI(c, depth + 1)).join('\n');
  const mods: string[] = [];
  if (layer.autoLayout?.paddingTop) mods.push(`${ind}.padding(.horizontal, ${layer.autoLayout.paddingLeft}).padding(.vertical, ${layer.autoLayout.paddingTop})`);
  if (layer.fills?.[0]?.color) mods.push(`${ind}.background(${hexToSwiftColor(layer.fills[0].color)})`);
  if (typeof layer.radius === 'number' && layer.radius > 0) mods.push(`${ind}.clipShape(RoundedRectangle(cornerRadius: ${layer.radius}))`);
  if (!kids) {
    return [`${ind}RoundedRectangle(cornerRadius: ${typeof layer.radius === 'number' ? layer.radius : 0})`, `${ind}  .frame(width: ${Math.round(layer.width)}, height: ${Math.round(layer.height)})`, ...mods].join('\n');
  }
  return [`${ind}${stack}(spacing: ${gap}) {`, kids, `${ind}}`, ...mods].join('\n');
}

function renderCompose(layer: InspectLayer, depth: number): string {
  const ind = '  '.repeat(depth);
  if (layer.type === 'TEXT') {
    const t = layer.typography;
    const hex = (layer.fills?.[0]?.color || '#111827').replace('#', '');
    return `${ind}Text(text = "${(layer.text || layer.name).replace(/"/g, '\\"')}", fontSize = ${t?.fontSize || 14}.sp, color = Color(0xFF${hex.toUpperCase()}))`;
  }
  const comp = layer.autoLayout?.direction === 'HORIZONTAL' ? 'Row' : 'Column';
  const mods: string[] = [`Modifier.size(width = ${Math.round(layer.width)}.dp, height = ${Math.round(layer.height)}.dp)`];
  if (layer.fills?.[0]?.color) {
    const hex = layer.fills[0].color.replace('#', '').toUpperCase();
    const shape = typeof layer.radius === 'number' && layer.radius > 0 ? `, RoundedCornerShape(${layer.radius}.dp)` : '';
    mods.push(`.background(Color(0xFF${hex})${shape})`);
  }
  if (layer.autoLayout?.paddingTop) mods.push(`.padding(horizontal = ${layer.autoLayout.paddingLeft}.dp, vertical = ${layer.autoLayout.paddingTop}.dp)`);
  const kids = (layer.children || []).slice(0, 14).map(c => renderCompose(c, depth + 1)).join('\n');
  if (!kids) return `${ind}Box(modifier = ${mods.join('')})`;
  return `${ind}${comp}(\n${ind}  modifier = ${mods.join('')},\n${ind}  ${comp === 'Row' ? 'horizontalArrangement' : 'verticalArrangement'} = Arrangement.spacedBy(${layer.autoLayout?.gap || 0}.dp)\n${ind}) {\n${kids}\n${ind}}`;
}

function renderFlutter(layer: InspectLayer, depth: number): string {
  const ind = '  '.repeat(depth);
  if (layer.type === 'TEXT') {
    const t = layer.typography;
    const hex = (layer.fills?.[0]?.color || '#111827').replace('#', '').toUpperCase();
    return `${ind}Text('${(layer.text || layer.name).replace(/'/g, "\\'")}', style: TextStyle(fontSize: ${t?.fontSize || 14}, fontWeight: FontWeight.w${t?.fontWeight || 400}, color: Color(0xFF${hex}))),`;
  }
  const hex = layer.fills?.[0]?.color?.replace('#', '').toUpperCase();
  const kids = (layer.children || []).slice(0, 14).map(c => renderFlutter(c, depth + 2)).join('\n');
  const childBlock = kids
    ? `${ind}  child: ${layer.autoLayout?.direction === 'HORIZONTAL' ? 'Row' : 'Column'}(\n${ind}    children: [\n${kids}\n${ind}    ],\n${ind}  ),`
    : '';
  return [
    `${ind}Container(`,
    `${ind}  width: ${Math.round(layer.width)},`,
    `${ind}  height: ${Math.round(layer.height)},`,
    hex ? `${ind}  decoration: BoxDecoration(color: Color(0xFF${hex}), borderRadius: BorderRadius.circular(${typeof layer.radius === 'number' ? layer.radius : 0})),` : '',
    childBlock,
    `${ind}),`
  ].filter(Boolean).join('\n');
}

export function generateCode(layer: InspectLayer, target: CodeTarget, unit: UnitMode): string {
  const compName = toPascal(layer.componentName || layer.name);

  switch (target) {
    case 'css':
      return `.${toKebab(layer.name)} {\n${layerToCssMap(layer, unit).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;

    case 'tailwind':
      return layerToTailwind(layer);

    case 'react-tailwind-ts':
      return `import React from 'react';\n\nexport interface ${compName}Props {\n  className?: string;\n}\n\nexport function ${compName}({ className = '' }: ${compName}Props) {\n  return (\n${renderJsxTree(layer, 2, true)}\n  );\n}\n`;

    case 'react-tailwind':
      return `import React from 'react';\n\nexport function ${compName}() {\n  return (\n${renderJsxTree(layer, 2, true)}\n  );\n}\n`;

    case 'react-css': {
      const cssRules: string[] = [];
      collectCssRules(layer, unit, cssRules, new Set());
      return `// ${compName}.tsx\nimport React from 'react';\nimport './${compName}.css';\n\nexport function ${compName}() {\n  return (\n${renderJsxTree(layer, 2, false)}\n  );\n}\n\n/* ${compName}.css */\n${cssRules.join('\n\n')}\n`;
    }

    case 'html-css': {
      const cssRules: string[] = [];
      collectCssRules(layer, unit, cssRules, new Set());
      const markup = renderJsxTree(layer, 1, false).replace(/className=/g, 'class=');
      return `<!-- ${layer.name} -->\n${markup}\n\n<style>\n${cssRules.join('\n\n')}\n</style>\n`;
    }

    case 'vue': {
      const cssRules: string[] = [];
      collectCssRules(layer, unit, cssRules, new Set());
      const markup = renderJsxTree(layer, 1, false).replace(/className=/g, 'class=');
      return `<template>\n${markup}\n</template>\n\n<script setup lang="ts">\n// ${compName}\n</script>\n\n<style scoped>\n${cssRules.join('\n\n')}\n</style>\n`;
    }

    case 'svelte': {
      const cssRules: string[] = [];
      collectCssRules(layer, unit, cssRules, new Set());
      const markup = renderJsxTree(layer, 0, false).replace(/className=/g, 'class=');
      return `<script lang="ts">\n  // ${compName}\n</script>\n\n${markup}\n\n<style>\n${cssRules.join('\n\n')}\n</style>\n`;
    }

    case 'react-native': {
      const fill = layer.fills?.[0]?.color;
      return `import React from 'react';\nimport { View, Text, StyleSheet } from 'react-native';\n\nexport function ${compName}() {\n  return (\n    <View style={styles.container}>\n      <Text style={styles.label}>${escapeHtml(layer.text || layer.name)}</Text>\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: {\n    width: ${Math.round(layer.width)},\n    height: ${Math.round(layer.height)},\n${layer.autoLayout ? `    flexDirection: '${layer.autoLayout.direction === 'HORIZONTAL' ? 'row' : 'column'}',\n    gap: ${layer.autoLayout.gap},\n    paddingHorizontal: ${layer.autoLayout.paddingLeft},\n    paddingVertical: ${layer.autoLayout.paddingTop},\n` : ''}${fill ? `    backgroundColor: '${fill}',\n` : ''}${typeof layer.radius === 'number' ? `    borderRadius: ${layer.radius},\n` : ''}  },\n  label: {\n    fontSize: ${layer.typography?.fontSize || 14},\n    fontWeight: '${layer.typography?.fontWeight || 500}',\n  },\n});\n`;
    }

    case 'swiftui':
      return `import SwiftUI\n\nstruct ${compName}View: View {\n  var body: some View {\n${renderSwiftUI(layer, 2)}\n  }\n}\n`;

    case 'compose':
      return `import androidx.compose.foundation.background\nimport androidx.compose.foundation.layout.*\nimport androidx.compose.foundation.shape.RoundedCornerShape\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.dp\nimport androidx.compose.ui.unit.sp\n\n@Composable\nfun ${compName}() {\n${renderCompose(layer, 1)}\n}\n`;

    case 'flutter':
      return `import 'package:flutter/material.dart';\n\nclass ${compName}Widget extends StatelessWidget {\n  const ${compName}Widget({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return ${renderFlutter(layer, 2).trim().replace(/,$/, '')};\n  }\n}\n`;
  }
}

export function exportTokens(
  tokens: TokenEntry[],
  format: 'css' | 'tailwind' | 'json' | 'scss',
  activeMode?: string
): string {
  const resolveVal = (t: TokenEntry) => (activeMode && t.modes?.[activeMode]) || t.value;

  if (format === 'css') {
    const lines = tokens.map(t => `  --${t.name.replace(/^--/, '')}: ${resolveVal(t)};`);
    return `:root${activeMode ? `[data-theme="${activeMode.toLowerCase()}"]` : ''} {\n${lines.join('\n')}\n}\n`;
  }
  if (format === 'tailwind') {
    const lines = tokens.map(t => `  --${t.category}-${t.name.replace(/^--/, '').replace(/^(color|spacing|radius|font|shadow)-/, '')}: ${resolveVal(t)};`);
    return `@theme {\n${lines.join('\n')}\n}\n`;
  }
  if (format === 'scss') {
    return tokens.map(t => `$${t.name.replace(/^--/, '')}: ${resolveVal(t)};`).join('\n') + '\n';
  }
  const obj: Record<string, Record<string, { $value: string; $type: string }>> = {};
  for (const t of tokens) {
    if (!obj[t.category]) obj[t.category] = {};
    obj[t.category][t.name.replace(/^--/, '')] = { $value: resolveVal(t), $type: t.category };
  }
  return JSON.stringify(obj, null, 2);
}

function toCamelCase(name: string): string {
  return name
    .replace(/^--/, '')
    .replace(/[-_\s]+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/** Formats a design token / variable into exact code syntax for the active framework target */
export function formatVariableSyntax(
  tokenName: string,
  target: CodeTarget,
  prop: 'bg' | 'text' | 'border' | 'raw' = 'raw'
): string {
  const clean = tokenName.replace(/^--/, '');
  const camel = toCamelCase(clean);
  if (target === 'swiftui') return `Color("${camel}")`;
  if (target === 'compose') return `AppTheme.tokens.${camel}`;
  if (target === 'flutter') return `AppTokens.${camel}`;
  if (target === 'react-native') return `tokens.${camel}`;
  if (target === 'tailwind' || target === 'react-tailwind' || target === 'react-tailwind-ts') {
    const short = clean.replace(/^color-/, '');
    if (prop === 'bg') return `bg-${short}`;
    if (prop === 'text') return `text-${short}`;
    if (prop === 'border') return `border-${short}`;
    return `var(--${clean})`;
  }
  return `var(--${clean})`;
}

/** Generates faithful absolute-positioned HTML preview for Preview & Compare modes with live Variable Mode resolution */
export function buildPreviewHtml(bundle: DevReadyBundle, activeMode?: string): string {
  const tokenByName = new Map<string, string>();
  const tokenByDefaultVal = new Map<string, string>();
  if (activeMode && bundle.tokens.length > 0) {
    for (const t of bundle.tokens) {
      const modeVal = t.modes?.[activeMode];
      if (!modeVal) continue;
      const clean = t.name.replace(/^--/, '');
      tokenByName.set(clean, modeVal);
      tokenByName.set(`--${clean}`, modeVal);
      if (t.category === 'color') {
        tokenByDefaultVal.set(t.value.toLowerCase(), modeVal);
      }
    }
  }

  const resolveColor = (color?: string, token?: string): string | undefined => {
    if (token && tokenByName.has(token)) return tokenByName.get(token);
    if (color && tokenByDefaultVal.has(color.toLowerCase())) {
      return tokenByDefaultVal.get(color.toLowerCase());
    }
    return color;
  };

  function resolveFillCss(node: InspectLayer): string | null {
    const f = node.fills?.[0];
    if (!f) return null;
    if (f.type === 'LINEAR_GRADIENT' && f.gradient) return f.gradient;
    const resolved = resolveColor(f.color, f.token);
    if (f.type === 'SOLID' && resolved) {
      if (f.opacity !== undefined && f.opacity < 0.99) {
        const hex = resolved.replace('#', '');
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${Math.round(f.opacity * 100) / 100})`;
        }
      }
      return resolved;
    }
    return null;
  }

  const safeCssVal = (v: string | undefined, fallback = ''): string => {
    if (!v || typeof v !== 'string') return fallback;
    return v.replace(/[<>"';{}\\]/g, '').trim() || fallback;
  };

  const rootBg = safeCssVal(
    resolveColor(bundle.backgroundColor, bundle.root.fills?.[0]?.token) || bundle.backgroundColor,
    '#FFFFFF'
  );

  function renderAbs(node: InspectLayer, parentX: number, parentY: number): string {
    if (node.visible === false) return '';
    const left = node.x - parentX;
    const top = node.y - parentY;
    const styles: string[] = [
      'position:absolute',
      `left:${left}px`,
      `top:${top}px`,
      `width:${node.width}px`,
      `height:${node.height}px`,
      'box-sizing:border-box'
    ];

    const fill = resolveFillCss(node);
    if (node.type === 'TEXT') {
      styles.push(`color:${safeCssVal(fill || '#111827', '#111827')}`);
      if (node.typography) {
        styles.push(
          `font-family:'${safeCssVal(node.typography.fontFamily, 'Inter')}', Inter, system-ui, sans-serif`,
          `font-size:${Number(node.typography.fontSize) || 14}px`,
          `font-weight:${Number(node.typography.fontWeight) || 400}`,
          `line-height:${Number(node.typography.lineHeight) || 20}px`,
          'display:flex',
          'align-items:center'
        );
        if (node.typography.letterSpacing) styles.push(`letter-spacing:${Number(node.typography.letterSpacing) || 0}px`);
        if (node.typography.textAlign === 'CENTER') styles.push('justify-content:center;text-align:center');
        if (node.typography.textAlign === 'RIGHT') styles.push('justify-content:flex-end;text-align:right');
      }
    } else if (fill) {
      const safeFill = safeCssVal(fill);
      if (safeFill) {
        styles.push(safeFill.startsWith('linear-gradient') ? `background:${safeFill}` : `background-color:${safeFill}`);
      }
    }

    if (node.strokes?.[0]) {
      const strokeColor = safeCssVal(
        resolveColor(node.strokes[0].color, node.strokes[0].token) || node.strokes[0].color,
        'transparent'
      );
      styles.push(`border:${Number(node.strokes[0].width) || 1}px ${node.strokes[0].dash ? 'dashed' : 'solid'} ${strokeColor}`);
    }
    if (node.radius !== undefined) {
      styles.push(`border-radius:${formatRadius(node.radius, 'px')}`);
    }
    if (node.opacity !== undefined) styles.push(`opacity:${Number(node.opacity)}`);
    const sh = shadowCss(node);
    if (sh) styles.push(`box-shadow:${safeCssVal(sh)}`);
    if (node.clipsContent) styles.push('overflow:hidden');

    const styleAttr = escapeHtml(styles.join(';'));
    if (node.type === 'TEXT') {
      return `<div style="${styleAttr}">${escapeHtml(node.text || '')}</div>`;
    }
    if (node.svg) {
      return `<div style="${styleAttr};display:flex;align-items:center;justify-content:center">${node.svg}</div>`;
    }
    const kids = (node.children || []).map(c => renderAbs(c, node.x, node.y)).join('');
    return `<div style="${styleAttr}">${kids}</div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{width:${Number(bundle.width) || 0}px;height:${Number(bundle.height) || 0}px;overflow:hidden;background:${rootBg};font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style></head><body>${renderAbs(bundle.root, bundle.root.x, bundle.root.y)}</body></html>`;
}

/** Minimal zero-dependency ZIP archive creator (STORE method + CRC32) */
export function makeZip(files: Array<{ name: string; content: string | Uint8Array }>): Blob {
  const enc = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c >>> 0;
  }
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }

  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: 'application/zip' });
}

/** Builds a self-contained portable HTML file that works completely offline */
export function buildStandaloneHtml(bundle: DevReadyBundle): string {
  const safeScriptJson = (val: unknown) =>
    JSON.stringify(val)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  const safeJson = safeScriptJson(bundle);
  const cssTokens = exportTokens(bundle.tokens, 'css');
  const preview = buildPreviewHtml(bundle);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(bundle.name)} — DevReady Portable Inspect</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,sans-serif;background:#111214;color:#f3f4f6;height:100vh;display:grid;grid-template-rows:44px 1fr;overflow:hidden}
  header{display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#18191c;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px}
  main{display:grid;grid-template-columns:1fr 340px;height:100%;overflow:hidden}
  .stage{position:relative;overflow:auto;display:grid;place-items:center;padding:40px;background-image:radial-gradient(rgba(255,255,255,.08) 1px,transparent 1px);background-size:20px 20px}
  .board{position:relative;box-shadow:0 24px 80px rgba(0,0,0,.55);border-radius:4px;overflow:hidden}
  .board iframe{display:block;border:0;pointer-events:none}
  .hit{position:absolute;cursor:pointer;border:1px solid transparent}
  .hit:hover{border-color:#f43f5e;background:rgba(244,63,94,.08)}
  .hit.sel{border:2px solid #0d99ff;background:rgba(13,153,255,.09)}
  aside{background:#18191c;border-left:1px solid rgba(255,255,255,.08);padding:16px;overflow:auto;font-size:12px}
  pre{background:#111214;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:12px;overflow:auto;font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;color:#e5e7eb;margin-top:8px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
  .kv{background:#202226;padding:8px 10px;border-radius:6px}
  .kv span{display:block;color:#9ca3af;font-size:10px;margin-bottom:2px}
  .kv b{font-family:ui-monospace,monospace;font-size:12px}
  h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-top:16px}
</style>
</head>
<body>
  <header>
    <div><strong>DevReady Portable</strong> · ${escapeHtml(bundle.name)} (${bundle.width}×${bundle.height})</div>
    <div style="color:#10b981">Offline Dev Mode · Zero Server</div>
  </header>
  <main>
    <div class="stage">
      <div class="board" id="board" style="width:${bundle.width}px;height:${bundle.height}px">
        <iframe id="prev" width="${bundle.width}" height="${bundle.height}" sandbox=""></iframe>
      </div>
    </div>
    <aside id="inspector"></aside>
  </main>
<script>
const BUNDLE = ${safeJson};
const TOKENS_CSS = ${safeScriptJson(cssTokens)};
document.getElementById('prev').srcdoc = ${safeScriptJson(preview)};
const board = document.getElementById('board');
const insp = document.getElementById('inspector');
let sel = BUNDLE.root;
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function flat(n, out=[]) { out.push(n); (n.children||[]).forEach(c=>flat(c,out)); return out; }
const layers = flat(BUNDLE.root);
function renderHits(){
  board.querySelectorAll('.hit').forEach(e=>e.remove());
  layers.forEach(l => {
    const d = document.createElement('div');
    d.className = 'hit' + (sel && sel.id === l.id ? ' sel' : '');
    d.style.left = l.x + 'px'; d.style.top = l.y + 'px'; d.style.width = l.width + 'px'; d.style.height = l.height + 'px';
    d.title = l.name + ' (' + Math.round(l.width) + '×' + Math.round(l.height) + ')';
    d.onclick = (e) => { e.stopPropagation(); sel = l; renderHits(); renderInsp(); };
    board.appendChild(d);
  });
}
function renderInsp(){
  const l = sel;
  const css = ['width: '+Math.round(l.width)+'px;', 'height: '+Math.round(l.height)+'px;'];
  if(l.fills && l.fills[0] && l.fills[0].color) css.push((l.type==='TEXT'?'color: ':'background: ')+l.fills[0].color+';');
  if(l.radius) css.push('border-radius: '+l.radius+'px;');
  if(l.typography) css.push('font: '+l.typography.fontWeight+' '+l.typography.fontSize+'px/'+l.typography.lineHeight+'px "'+l.typography.fontFamily+'";');
  insp.innerHTML = '<div style="font-size:15px;font-weight:600">'+esc(l.name)+'</div><div style="color:#9ca3af;margin-top:2px">'+esc(l.type)+'</div>'
    + '<div class="meta"><div class="kv"><span>Width × Height</span><b>'+Math.round(l.width)+' × '+Math.round(l.height)+'px</b></div><div class="kv"><span>Position</span><b>X '+Math.round(l.x)+' · Y '+Math.round(l.y)+'</b></div></div>'
    + (l.text ? '<h3>Text Content</h3><pre>'+esc(l.text)+'</pre>' : '')
    + '<h3>CSS</h3><pre>'+esc(css.join('\\n'))+'</pre>'
    + '<h3>Design Tokens</h3><pre>'+esc(TOKENS_CSS)+'</pre>';
}
renderHits(); renderInsp();
</script>
</body>
</html>`;
}
