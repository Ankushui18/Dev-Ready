/* DevReady Web Bridge — Standalone Figma → Web Studio Exporter
   Completely separate from devready-plugin/ so the main plugin stays untouched.
   Extracts full vector tree, real Figma Local Variables & Modes, bound token refs,
   Component names, native Figma Annotations, SVG icons, and 2x PNG screenshot. */
'use strict';

figma.showUI(__html__, { width: 340, height: 470, themeColors: true });

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function rgbToHex(c) {
  if (!c) return '#000000';
  const toHex = v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return ('#' + toHex(c.r) + toHex(c.g) + toHex(c.b)).toUpperCase();
}

function slugToken(name) {
  return String(name || 'token')
    .trim()
    .toLowerCase()
    .replace(/[\/\s]+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

function extractFills(node, varMap) {
  if (!Array.isArray(node.fills)) return undefined;
  const boundFills = node.boundVariables && Array.isArray(node.boundVariables.fills)
    ? node.boundVariables.fills
    : [];
  const out = [];
  for (let i = 0; i < node.fills.length; i++) {
    const f = node.fills[i];
    if (f.visible === false) continue;
    const bv = boundFills[i] && boundFills[i].id ? varMap.get(boundFills[i].id) : null;
    if (f.type === 'SOLID' && f.color) {
      const entry = {
        type: 'SOLID',
        color: rgbToHex(f.color),
        opacity: f.opacity !== undefined ? round(f.opacity) : 1
      };
      if (bv) entry.token = '--' + bv.tokenName;
      out.push(entry);
    } else if (f.type === 'GRADIENT_LINEAR' && Array.isArray(f.gradientStops) && f.gradientStops.length >= 2) {
      const stops = f.gradientStops.map(s => rgbToHex(s.color) + ' ' + Math.round(s.position * 100) + '%').join(', ');
      out.push({ type: 'LINEAR_GRADIENT', gradient: 'linear-gradient(135deg, ' + stops + ')' });
    }
  }
  return out.length ? out : undefined;
}

function extractStrokes(node, varMap) {
  if (!Array.isArray(node.strokes) || !node.strokes.length) return undefined;
  const boundStrokes = node.boundVariables && Array.isArray(node.boundVariables.strokes)
    ? node.boundVariables.strokes
    : [];
  const out = [];
  const w = typeof node.strokeWeight === 'number' ? round(node.strokeWeight) : 1;
  for (let i = 0; i < node.strokes.length; i++) {
    const s = node.strokes[i];
    if (s.visible === false || s.type !== 'SOLID' || !s.color) continue;
    const bv = boundStrokes[i] && boundStrokes[i].id ? varMap.get(boundStrokes[i].id) : null;
    const entry = { color: rgbToHex(s.color), width: w };
    if (bv) entry.token = '--' + bv.tokenName;
    out.push(entry);
  }
  return out.length ? out : undefined;
}

function extractEffects(node) {
  if (!Array.isArray(node.effects) || !node.effects.length) return undefined;
  const out = [];
  for (const e of node.effects) {
    if (e.visible === false) continue;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const c = e.color
        ? `rgba(${Math.round(e.color.r * 255)},${Math.round(e.color.g * 255)},${Math.round(e.color.b * 255)},${round(e.color.a)})`
        : 'rgba(0,0,0,0.16)';
      out.push({
        type: e.type,
        x: e.offset ? round(e.offset.x) : 0,
        y: e.offset ? round(e.offset.y) : 0,
        blur: round(e.radius || 0),
        spread: round(e.spread || 0),
        color: c
      });
    }
  }
  return out.length ? out : undefined;
}

function extractRadius(node) {
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) return round(node.cornerRadius);
  if (typeof node.topLeftRadius === 'number') {
    const arr = [
      round(node.topLeftRadius),
      round(node.topRightRadius || 0),
      round(node.bottomRightRadius || 0),
      round(node.bottomLeftRadius || 0)
    ];
    if (arr.some(v => v > 0)) return arr;
  }
  return undefined;
}

function extractAutoLayout(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return undefined;
  const alignMap = { MIN: 'START', CENTER: 'CENTER', MAX: 'END', SPACE_BETWEEN: 'SPACE_BETWEEN' };
  return {
    direction: node.layoutMode === 'HORIZONTAL' ? 'HORIZONTAL' : 'VERTICAL',
    gap: round(node.itemSpacing || 0),
    paddingTop: round(node.paddingTop || 0),
    paddingRight: round(node.paddingRight || 0),
    paddingBottom: round(node.paddingBottom || 0),
    paddingLeft: round(node.paddingLeft || 0),
    alignItems: alignMap[node.counterAxisAlignItems] || 'START',
    justifyContent: alignMap[node.primaryAxisAlignItems] || 'START'
  };
}

function parseFontWeight(styleName) {
  const s = String(styleName || 'Regular').toLowerCase();
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('extra bold') || s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('bold')) return 700;
  if (s.includes('semi') || s.includes('demi')) return 600;
  if (s.includes('medium')) return 500;
  if (s.includes('light') && !s.includes('extra')) return 300;
  if (s.includes('thin') || s.includes('hairline')) return 200;
  return 400;
}

function extractTypography(node) {
  if (node.type !== 'TEXT') return undefined;
  const fontSize = typeof node.fontSize === 'number' ? round(node.fontSize) : 14;
  const fontName = node.fontName && typeof node.fontName === 'object' ? node.fontName : { family: 'Inter', style: 'Regular' };
  const weight = parseFontWeight(fontName.style);
  let lineHeight = Math.round(fontSize * 1.4);
  if (node.lineHeight && typeof node.lineHeight === 'object') {
    if (node.lineHeight.unit === 'PIXELS') {
      lineHeight = round(node.lineHeight.value);
    } else if (node.lineHeight.unit === 'PERCENT') {
      lineHeight = round((fontSize * node.lineHeight.value) / 100);
    }
  }
  let letterSpacing;
  if (node.letterSpacing && typeof node.letterSpacing === 'object') {
    if (node.letterSpacing.unit === 'PIXELS' && node.letterSpacing.value !== 0) {
      letterSpacing = round(node.letterSpacing.value);
    } else if (node.letterSpacing.unit === 'PERCENT' && node.letterSpacing.value !== 0) {
      letterSpacing = round((fontSize * node.letterSpacing.value) / 100);
    }
  }
  return {
    fontFamily: fontName.family || 'Inter',
    fontWeight: weight,
    fontSize,
    lineHeight,
    letterSpacing,
    textAlign:
      node.textAlignHorizontal === 'CENTER'
        ? 'CENTER'
        : node.textAlignHorizontal === 'RIGHT'
          ? 'RIGHT'
          : 'LEFT'
  };
}

function mapType(t) {
  if (t === 'FRAME' || t === 'COMPONENT' || t === 'INSTANCE' || t === 'GROUP' || t === 'TEXT' || t === 'RECTANGLE' || t === 'ELLIPSE' || t === 'VECTOR') {
    return t;
  }
  if (t === 'BOOLEAN_OPERATION' || t === 'STAR' || t === 'POLYGON' || t === 'LINE') return 'VECTOR';
  return 'FRAME';
}

/* Resolve Figma Local Variables & Modes safely (works on Free + Paid Figma plans) */
async function extractLocalVariables() {
  const varMap = new Map();
  const tokens = [];
  const modeSet = new Set();

  if (!figma.variables || typeof figma.variables.getLocalVariablesAsync !== 'function') {
    return { varMap, tokens, variableModes: [] };
  }

  try {
    const [collections, variables] = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync()
    ]);

    const colById = new Map();
    for (const c of collections) colById.set(c.id, c);

    const rawById = new Map();
    for (const v of variables) rawById.set(v.id, v);

    const resolveValue = (v, modeId, depth) => {
      if (!v || depth > 4) return null;
      const val = v.valuesByMode[modeId] !== undefined
        ? v.valuesByMode[modeId]
        : v.valuesByMode[Object.keys(v.valuesByMode)[0]];
      if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS' && val.id) {
        const target = rawById.get(val.id);
        return target ? resolveValue(target, modeId, depth + 1) : null;
      }
      return val;
    };

    const formatVal = (resolvedType, val) => {
      if (val === null || val === undefined) return null;
      if (resolvedType === 'COLOR' && typeof val === 'object' && 'r' in val) {
        return rgbToHex(val);
      }
      if (resolvedType === 'FLOAT' && typeof val === 'number') {
        return round(val) + 'px';
      }
      if (resolvedType === 'STRING') return String(val);
      return null;
    };

    for (const v of variables) {
      if (v.resolvedType !== 'COLOR' && v.resolvedType !== 'FLOAT' && v.resolvedType !== 'STRING') continue;
      const col = colById.get(v.variableCollectionId);
      const modes = col && Array.isArray(col.modes) && col.modes.length ? col.modes : [];
      const defaultModeId = col ? col.defaultModeId : (modes[0] && modes[0].modeId);

      const primaryFormatted = formatVal(v.resolvedType, resolveValue(v, defaultModeId, 0));
      if (!primaryFormatted) continue;

      const tokenName = slugToken(v.name);
      const lower = tokenName.toLowerCase();
      const category =
        v.resolvedType === 'COLOR'
          ? 'color'
          : lower.includes('radius') || lower.includes('corner')
            ? 'radius'
            : v.resolvedType === 'FLOAT'
              ? 'spacing'
              : 'typography';

      const modesObj = {};
      if (modes.length > 1) {
        for (const m of modes) {
          const mv = formatVal(v.resolvedType, resolveValue(v, m.modeId, 0));
          if (mv) {
            modesObj[m.name] = mv;
            modeSet.add(m.name);
          }
        }
      }

      const tokenEntry = {
        name: tokenName,
        category,
        value: primaryFormatted,
        collection: col ? col.name : 'Variables',
        description: v.description || undefined,
        modes: Object.keys(modesObj).length > 1 ? modesObj : undefined
      };
      varMap.set(v.id, { tokenName, tokenEntry });
      tokens.push(tokenEntry);
    }
  } catch (_) {
    // Graceful fallback on older runtimes
  }

  return {
    varMap,
    tokens: tokens.slice(0, 80),
    variableModes: Array.from(modeSet).slice(0, 6)
  };
}

const MAX_NODES = 350;

async function extractLayerTree(node, rootOrigin, state, varMap) {
  if (node.visible === false || state.count >= MAX_NODES) return null;
  state.count++;

  const box = node.absoluteBoundingBox || { x: rootOrigin.x, y: rootOrigin.y, width: node.width || 0, height: node.height || 0 };
  const fills = extractFills(node, varMap);
  if (fills) {
    for (const f of fills) {
      if (f.type === 'SOLID' && f.color) state.colors.add(f.color);
    }
  }

  // Extract component name for INSTANCE / COMPONENT nodes so Code Connect & Playground trigger automatically
  let componentName;
  if (node.type === 'COMPONENT') {
    componentName = node.name;
  } else if (node.type === 'INSTANCE') {
    try {
      const mainComp = typeof node.getMainComponentAsync === 'function'
        ? await node.getMainComponentAsync()
        : node.mainComponent;
      if (mainComp && mainComp.name) {
        componentName = mainComp.parent && mainComp.parent.type === 'COMPONENT_SET'
          ? mainComp.parent.name
          : mainComp.name;
      }
    } catch (_) {}
  }

  // Extract native Figma Dev Mode annotations if present
  if (Array.isArray(node.annotations) && node.annotations.length) {
    for (const ann of node.annotations) {
      const label = String(ann.label || ann.labelMarkdown || '').trim();
      if (!label) continue;
      state.annotations.push({
        id: 'fig-ann-' + node.id + '-' + state.annotations.length,
        layerId: node.id,
        category: 'dev',
        text: label,
        createdAt: new Date().toISOString()
      });
    }
  }

  let svg;
  const mappedType = mapType(node.type);
  if (mappedType === 'VECTOR' && box.width <= 96 && box.height <= 96 && state.assets.length < 32) {
    try {
      const bytes = await node.exportAsync({ format: 'SVG' });
      svg = String.fromCharCode.apply(null, Array.from(bytes));
      state.assets.push({
        id: node.id,
        name: (node.name || 'icon').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        format: 'SVG',
        width: round(box.width),
        height: round(box.height),
        svg
      });
    } catch (_) {}
  }

  const out = {
    id: node.id,
    name: node.name || node.type,
    type: mappedType,
    componentName,
    x: round(box.x - rootOrigin.x),
    y: round(box.y - rootOrigin.y),
    width: round(box.width),
    height: round(box.height),
    opacity: typeof node.opacity === 'number' && node.opacity < 0.99 ? round(node.opacity) : undefined,
    radius: extractRadius(node),
    clipsContent: Boolean(node.clipsContent),
    fills,
    strokes: extractStrokes(node, varMap),
    effects: extractEffects(node),
    autoLayout: extractAutoLayout(node),
    typography: extractTypography(node),
    text: node.type === 'TEXT' ? String(node.characters || '') : undefined,
    svg
  };

  if (Array.isArray(node.children) && node.children.length && mappedType !== 'VECTOR') {
    const kids = [];
    for (const c of node.children) {
      const child = await extractLayerTree(c, rootOrigin, state, varMap);
      if (child) kids.push(child);
    }
    if (kids.length) out.children = kids;
  }

  return out;
}

function sendSelectionInfo() {
  const sel = figma.currentPage.selection[0];
  if (!sel) {
    figma.ui.postMessage({ type: 'selection', node: null });
    return;
  }
  figma.ui.postMessage({
    type: 'selection',
    node: {
      id: sel.id,
      name: sel.name,
      type: sel.type,
      width: round(sel.width || 0),
      height: round(sel.height || 0)
    }
  });
}

figma.on('selectionchange', sendSelectionInfo);

figma.ui.onmessage = async msg => {
  if (msg.type === 'ready') {
    const savedUrl = await figma.clientStorage.getAsync('devready-web-url').catch(() => '');
    figma.ui.postMessage({ type: 'config', webUrl: savedUrl || 'https://devready-studio.vercel.app' });
    sendSelectionInfo();
    return;
  }

  if (msg.type === 'save-url' && typeof msg.webUrl === 'string') {
    await figma.clientStorage.setAsync('devready-web-url', msg.webUrl.trim());
    return;
  }

  if (msg.type === 'open-url' && typeof msg.url === 'string') {
    figma.openExternal(msg.url);
    return;
  }

  if (msg.type === 'extract') {
    const sel = figma.currentPage.selection[0];
    if (!sel) {
      figma.ui.postMessage({ type: 'error', message: 'Select a frame or component in Figma first.' });
      return;
    }
    try {
      const rootBox = sel.absoluteBoundingBox || { x: 0, y: 0, width: sel.width || 375, height: sel.height || 667 };
      const { varMap, tokens: varTokens, variableModes } = await extractLocalVariables();
      const state = { count: 0, colors: new Set(), assets: [], annotations: [] };
      const root = await extractLayerTree(sel, { x: rootBox.x, y: rootBox.y }, state, varMap);

      // Export crisp 2x PNG screenshot of selected frame
      let screenshotDataUrl;
      if (msg.includeScreenshot !== false) {
        const pngBytes = await sel.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
        screenshotDataUrl = 'data:image/png;base64,' + figma.base64Encode(pngBytes);
      }

      const bgColor = (root.fills && root.fills[0] && root.fills[0].color) || '#FFFFFF';

      // Prefer real Figma Variables; supplement with extracted solid colors if no variables exist
      const existingHex = new Set(varTokens.filter(t => t.category === 'color').map(t => String(t.value).toUpperCase()));
      const fallbackColors = Array.from(state.colors)
        .filter(hex => !existingHex.has(hex.toUpperCase()))
        .slice(0, varTokens.length ? 12 : 30)
        .map((hex, i) => ({
          name: 'color-' + (i + 1),
          category: 'color',
          value: hex,
          collection: 'Extracted Colors'
        }));

      const tokens = varTokens.concat(fallbackColors);

      // Deterministic frame ID so re-exporting the same Figma frame automatically triggers Compare Changes diff!
      const fileSlug = slugToken(figma.fileKey || figma.root.name || 'file').slice(0, 24);
      const nodeSlug = String(sel.id || 'node').replace(/[^a-zA-Z0-9]/g, '-');
      const stableId = 'figma-' + fileSlug + '-' + nodeSlug;

      const bundle = {
        version: 1,
        id: stableId,
        name: sel.name,
        fileName: figma.root.name,
        pageName: figma.currentPage.name,
        status: 'ready',
        updatedAt: new Date().toISOString(),
        source: 'figma-plugin',
        width: round(rootBox.width),
        height: round(rootBox.height),
        backgroundColor: bgColor,
        screenshotDataUrl,
        root,
        tokens,
        tokenModes: variableModes.length > 1 ? variableModes : undefined,
        annotations: state.annotations.length ? state.annotations : undefined,
        assets: state.assets
      };

      figma.ui.postMessage({ type: 'extracted', mode: msg.mode, bundle, layerCount: state.count });
    } catch (e) {
      figma.ui.postMessage({ type: 'error', message: e && e.message ? e.message : 'Extraction failed' });
    }
  }
};
