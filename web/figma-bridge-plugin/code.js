/* DevReady Web Bridge — Standalone Figma -> Web Studio Exporter
   Completely separate from devready-plugin/ so the main plugin stays untouched.
   Extracts full vector tree, Figma Local Variables & Modes, bound token refs,
   Component names, native Figma Annotations, SVG icons, and smart-scaled PNG screenshot. */
'use strict';

figma.showUI(__html__, { width: 356, height: 520, themeColors: true });

var DEFAULT_STUDIO_URL = 'https://devready-studio.vercel.app';
var MAX_NODES = 350;
var MAX_PNG_BYTES = 2200000; // 2.2 MB ceiling so transfers stay fast & reliable

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function rgbToHex(c) {
  if (!c) return '#000000';
  var toHex = function (v) {
    return Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  };
  return ('#' + toHex(c.r) + toHex(c.g) + toHex(c.b)).toUpperCase();
}

function bytesToUtf8(bytes) {
  if (!bytes || !bytes.length) return '';
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) {}
  }
  var out = '';
  var chunk = 8192;
  for (var i = 0; i < bytes.length; i += chunk) {
    var end = Math.min(i + chunk, bytes.length);
    var part = '';
    for (var j = i; j < end; j++) {
      part += String.fromCharCode(bytes[j]);
    }
    out += part;
  }
  return out;
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
  var boundFills =
    node.boundVariables && Array.isArray(node.boundVariables.fills)
      ? node.boundVariables.fills
      : [];
  var out = [];
  for (var i = 0; i < node.fills.length; i++) {
    var f = node.fills[i];
    if (!f || f.visible === false) continue;
    var bv = boundFills[i] && boundFills[i].id ? varMap.get(boundFills[i].id) : null;
    if (f.type === 'SOLID' && f.color) {
      var entry = {
        type: 'SOLID',
        color: rgbToHex(f.color),
        opacity: f.opacity !== undefined ? round(f.opacity) : 1
      };
      if (bv) entry.token = '--' + bv.tokenName;
      out.push(entry);
    } else if (
      f.type === 'GRADIENT_LINEAR' &&
      Array.isArray(f.gradientStops) &&
      f.gradientStops.length >= 2
    ) {
      var stops = f.gradientStops
        .map(function (s) {
          return rgbToHex(s.color) + ' ' + Math.round(s.position * 100) + '%';
        })
        .join(', ');
      out.push({
        type: 'LINEAR_GRADIENT',
        color: rgbToHex(f.gradientStops[0].color),
        gradient: 'linear-gradient(135deg, ' + stops + ')'
      });
    }
  }
  return out.length ? out : undefined;
}

function extractStrokes(node, varMap) {
  if (!Array.isArray(node.strokes) || !node.strokes.length) return undefined;
  var boundStrokes =
    node.boundVariables && Array.isArray(node.boundVariables.strokes)
      ? node.boundVariables.strokes
      : [];
  var out = [];
  var w = typeof node.strokeWeight === 'number' ? round(node.strokeWeight) : 1;
  for (var i = 0; i < node.strokes.length; i++) {
    var s = node.strokes[i];
    if (!s || s.visible === false || s.type !== 'SOLID' || !s.color) continue;
    var bv = boundStrokes[i] && boundStrokes[i].id ? varMap.get(boundStrokes[i].id) : null;
    var entry = { color: rgbToHex(s.color), width: w };
    if (bv) entry.token = '--' + bv.tokenName;
    out.push(entry);
  }
  return out.length ? out : undefined;
}

function extractEffects(node) {
  if (!Array.isArray(node.effects) || !node.effects.length) return undefined;
  var out = [];
  for (var i = 0; i < node.effects.length; i++) {
    var e = node.effects[i];
    if (!e || e.visible === false) continue;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      var c = e.color
        ? 'rgba(' +
          Math.round(e.color.r * 255) +
          ',' +
          Math.round(e.color.g * 255) +
          ',' +
          Math.round(e.color.b * 255) +
          ',' +
          round(e.color.a) +
          ')'
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
    var arr = [
      round(node.topLeftRadius),
      round(node.topRightRadius || 0),
      round(node.bottomRightRadius || 0),
      round(node.bottomLeftRadius || 0)
    ];
    if (arr.some(function (v) { return v > 0; })) return arr;
  }
  return undefined;
}

function extractAutoLayout(node) {
  if (!node.layoutMode || node.layoutMode === 'NONE') return undefined;
  var alignMap = { MIN: 'START', CENTER: 'CENTER', MAX: 'END', SPACE_BETWEEN: 'SPACE_BETWEEN' };
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
  var s = String(styleName || 'Regular').toLowerCase();
  if (s.indexOf('black') !== -1 || s.indexOf('heavy') !== -1) return 900;
  if (s.indexOf('extra bold') !== -1 || s.indexOf('extrabold') !== -1 || s.indexOf('ultrabold') !== -1) return 800;
  if (s.indexOf('bold') !== -1) return 700;
  if (s.indexOf('semi') !== -1 || s.indexOf('demi') !== -1) return 600;
  if (s.indexOf('medium') !== -1) return 500;
  if (s.indexOf('light') !== -1 && s.indexOf('extra') === -1) return 300;
  if (s.indexOf('thin') !== -1 || s.indexOf('hairline') !== -1) return 200;
  return 400;
}

function extractTypography(node) {
  if (node.type !== 'TEXT') return undefined;
  var fontSize = typeof node.fontSize === 'number' ? round(node.fontSize) : 14;
  var fontName =
    node.fontName && typeof node.fontName === 'object'
      ? node.fontName
      : { family: 'Inter', style: 'Regular' };
  var weight = parseFontWeight(fontName.style);
  var lineHeight = Math.round(fontSize * 1.4);
  if (node.lineHeight && typeof node.lineHeight === 'object') {
    if (node.lineHeight.unit === 'PIXELS') {
      lineHeight = round(node.lineHeight.value);
    } else if (node.lineHeight.unit === 'PERCENT') {
      lineHeight = round((fontSize * node.lineHeight.value) / 100);
    }
  }
  var letterSpacing;
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
    fontSize: fontSize,
    lineHeight: lineHeight,
    letterSpacing: letterSpacing,
    textAlign:
      node.textAlignHorizontal === 'CENTER'
        ? 'CENTER'
        : node.textAlignHorizontal === 'RIGHT'
          ? 'RIGHT'
          : 'LEFT'
  };
}

function mapType(t) {
  if (
    t === 'FRAME' ||
    t === 'COMPONENT' ||
    t === 'INSTANCE' ||
    t === 'GROUP' ||
    t === 'TEXT' ||
    t === 'RECTANGLE' ||
    t === 'ELLIPSE' ||
    t === 'VECTOR'
  ) {
    return t;
  }
  if (t === 'BOOLEAN_OPERATION' || t === 'STAR' || t === 'POLYGON' || t === 'LINE') return 'VECTOR';
  return 'FRAME';
}

/* Resolve Figma Local Variables & Modes safely (works on Free + Paid Figma plans) */
async function extractLocalVariables() {
  var varMap = new Map();
  var tokens = [];
  var modeSet = new Set();

  if (!figma.variables || typeof figma.variables.getLocalVariablesAsync !== 'function') {
    return { varMap: varMap, tokens: tokens, variableModes: [] };
  }

  try {
    var results = await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync()
    ]);
    var collections = results[0] || [];
    var variables = results[1] || [];

    var colById = new Map();
    for (var ci = 0; ci < collections.length; ci++) colById.set(collections[ci].id, collections[ci]);

    var rawById = new Map();
    for (var vi = 0; vi < variables.length; vi++) rawById.set(variables[vi].id, variables[vi]);

    var resolveValue = function (v, modeId, depth) {
      if (!v || depth > 4 || !v.valuesByMode) return null;
      var keys = Object.keys(v.valuesByMode);
      var val = v.valuesByMode[modeId] !== undefined ? v.valuesByMode[modeId] : v.valuesByMode[keys[0]];
      if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS' && val.id) {
        var target = rawById.get(val.id);
        return target ? resolveValue(target, modeId, depth + 1) : null;
      }
      return val;
    };

    var formatVal = function (resolvedType, val) {
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

    for (var i = 0; i < variables.length; i++) {
      var v = variables[i];
      if (v.resolvedType !== 'COLOR' && v.resolvedType !== 'FLOAT' && v.resolvedType !== 'STRING') continue;
      var col = colById.get(v.variableCollectionId);
      var modes = col && Array.isArray(col.modes) && col.modes.length ? col.modes : [];
      var defaultModeId = col ? col.defaultModeId : modes[0] && modes[0].modeId;

      var primaryFormatted = formatVal(v.resolvedType, resolveValue(v, defaultModeId, 0));
      if (!primaryFormatted) continue;

      var tokenName = slugToken(v.name);
      var lower = tokenName.toLowerCase();
      var category =
        v.resolvedType === 'COLOR'
          ? 'color'
          : lower.indexOf('radius') !== -1 || lower.indexOf('corner') !== -1
            ? 'radius'
            : v.resolvedType === 'FLOAT'
              ? 'spacing'
              : 'typography';

      var modesObj = {};
      if (modes.length > 1) {
        for (var mi = 0; mi < modes.length; mi++) {
          var m = modes[mi];
          var mv = formatVal(v.resolvedType, resolveValue(v, m.modeId, 0));
          if (mv) {
            modesObj[m.name] = mv;
            modeSet.add(m.name);
          }
        }
      }

      var tokenEntry = {
        name: '--' + tokenName,
        category: category,
        value: primaryFormatted,
        modes: Object.keys(modesObj).length > 1 ? modesObj : undefined
      };
      varMap.set(v.id, { tokenName: tokenName, tokenEntry: tokenEntry });
      tokens.push(tokenEntry);
    }
  } catch (_) {
    // Graceful fallback on older runtimes
  }

  return {
    varMap: varMap,
    tokens: tokens.slice(0, 80),
    variableModes: Array.from(modeSet).slice(0, 6)
  };
}

async function extractLayerTree(node, rootOrigin, state, varMap) {
  if (!node || node.visible === false || state.count >= MAX_NODES) return null;
  state.count++;

  var box = node.absoluteBoundingBox || {
    x: rootOrigin.x,
    y: rootOrigin.y,
    width: node.width || 0,
    height: node.height || 0
  };
  var fills = extractFills(node, varMap);
  if (fills) {
    for (var fi = 0; fi < fills.length; fi++) {
      if (fills[fi].type === 'SOLID' && fills[fi].color) state.colors.add(fills[fi].color);
    }
  }

  // Always use async API under documentAccess: "dynamic-page"
  var componentName;
  if (node.type === 'COMPONENT') {
    componentName = node.name;
  } else if (node.type === 'INSTANCE') {
    try {
      if (typeof node.getMainComponentAsync === 'function') {
        var mainComp = await node.getMainComponentAsync();
        if (mainComp && mainComp.name) {
          componentName =
            mainComp.parent && mainComp.parent.type === 'COMPONENT_SET'
              ? mainComp.parent.name
              : mainComp.name;
        }
      }
    } catch (_) {}
  }

  if (Array.isArray(node.annotations) && node.annotations.length) {
    for (var ai = 0; ai < node.annotations.length; ai++) {
      var ann = node.annotations[ai];
      var label = String((ann && (ann.label || ann.labelMarkdown)) || '').trim();
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

  var svg;
  var mappedType = mapType(node.type);
  if (mappedType === 'VECTOR' && box.width <= 96 && box.height <= 96 && state.assets.length < 24) {
    try {
      var bytes = await node.exportAsync({ format: 'SVG' });
      if (bytes && bytes.length <= 40000) {
        svg = bytesToUtf8(bytes);
        state.assets.push({
          id: node.id,
          name: (node.name || 'icon').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          format: 'SVG',
          width: round(box.width),
          height: round(box.height),
          svg: svg
        });
      }
    } catch (_) {}
  }

  var out = {
    id: node.id,
    name: node.name || node.type,
    type: mappedType,
    componentName: componentName,
    x: round(box.x - rootOrigin.x),
    y: round(box.y - rootOrigin.y),
    width: Math.max(1, round(box.width)),
    height: Math.max(1, round(box.height)),
    opacity: typeof node.opacity === 'number' && node.opacity < 0.99 ? round(node.opacity) : undefined,
    radius: extractRadius(node),
    clipsContent: Boolean(node.clipsContent),
    fills: fills,
    strokes: extractStrokes(node, varMap),
    effects: extractEffects(node),
    autoLayout: extractAutoLayout(node),
    typography: extractTypography(node),
    text: node.type === 'TEXT' ? String(node.characters || '') : undefined,
    svg: svg
  };

  if (Array.isArray(node.children) && node.children.length && mappedType !== 'VECTOR') {
    var kids = [];
    for (var ki = 0; ki < node.children.length; ki++) {
      var child = await extractLayerTree(node.children[ki], rootOrigin, state, varMap);
      if (child) kids.push(child);
    }
    if (kids.length) out.children = kids;
  }

  return out;
}

async function exportSmartScreenshot(node, box) {
  try {
    var maxSide = Math.max(box.width || 0, box.height || 0);
    var scale = maxSide > 2200 ? 1 : maxSide > 1200 ? 1.5 : 2;
    var pngBytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale }
    });
    if (pngBytes && pngBytes.length > MAX_PNG_BYTES && scale > 1) {
      pngBytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 }
      });
    }
    if (pngBytes && pngBytes.length <= MAX_PNG_BYTES) {
      return 'data:image/png;base64,' + figma.base64Encode(pngBytes);
    }
  } catch (_) {}
  return undefined;
}

function sendSelectionInfo() {
  try {
    var sel = figma.currentPage && figma.currentPage.selection ? figma.currentPage.selection[0] : null;
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
  } catch (_) {
    figma.ui.postMessage({ type: 'selection', node: null });
  }
}

figma.on('selectionchange', sendSelectionInfo);

figma.ui.onmessage = async function (msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'ready') {
    var savedUrl = '';
    try {
      savedUrl = (await figma.clientStorage.getAsync('devready-web-url')) || '';
    } catch (_) {}
    // Migrate old localhost default automatically to live Vercel URL
    if (!savedUrl || savedUrl === 'http://localhost:5173' || savedUrl === 'http://localhost:5173/') {
      savedUrl = DEFAULT_STUDIO_URL;
    }
    figma.ui.postMessage({ type: 'config', webUrl: savedUrl });
    sendSelectionInfo();
    return;
  }

  if (msg.type === 'save-url' && typeof msg.webUrl === 'string') {
    try {
      await figma.clientStorage.setAsync('devready-web-url', msg.webUrl.trim());
    } catch (_) {}
    return;
  }

  if (msg.type === 'open-url' && typeof msg.url === 'string') {
    try {
      figma.openExternal(msg.url);
    } catch (_) {}
    return;
  }

  if (msg.type === 'extract') {
    var sel = figma.currentPage && figma.currentPage.selection ? figma.currentPage.selection[0] : null;
    if (!sel) {
      figma.ui.postMessage({ type: 'error', message: 'Select a frame or component in Figma first.' });
      return;
    }
    try {
      var rootBox = sel.absoluteBoundingBox || {
        x: 0,
        y: 0,
        width: sel.width || 375,
        height: sel.height || 667
      };
      var vars = await extractLocalVariables();
      var state = { count: 0, colors: new Set(), assets: [], annotations: [] };
      var root = await extractLayerTree(sel, { x: rootBox.x, y: rootBox.y }, state, vars.varMap);
      if (!root) {
        figma.ui.postMessage({ type: 'error', message: 'Selected layer is hidden or empty.' });
        return;
      }

      var screenshotDataUrl;
      if (msg.includeScreenshot !== false) {
        screenshotDataUrl = await exportSmartScreenshot(sel, rootBox);
      }

      var bgColor = (root.fills && root.fills[0] && root.fills[0].color) || '#FFFFFF';

      var existingHex = new Set(
        vars.tokens
          .filter(function (t) { return t.category === 'color'; })
          .map(function (t) { return String(t.value).toUpperCase(); })
      );
      var fallbackColors = Array.from(state.colors)
        .filter(function (hex) { return !existingHex.has(hex.toUpperCase()); })
        .slice(0, vars.tokens.length ? 12 : 24)
        .map(function (hex, idx) {
          return {
            name: '--color-' + (idx + 1),
            category: 'color',
            value: hex
          };
        });

      var tokens = vars.tokens.concat(fallbackColors);

      var fileKeySafe = '';
      try {
        fileKeySafe = figma.fileKey || '';
      } catch (_) {}
      var fileSlug = slugToken(fileKeySafe || (figma.root && figma.root.name) || 'file').slice(0, 24);
      var nodeSlug = String(sel.id || 'node').replace(/[^a-zA-Z0-9]/g, '-');
      var stableId = 'figma-' + fileSlug + '-' + nodeSlug;

      var bundle = {
        version: 1,
        id: stableId,
        name: sel.name || 'Figma Frame',
        fileName: (figma.root && figma.root.name) || 'Figma File',
        pageName: (figma.currentPage && figma.currentPage.name) || 'Page 1',
        status: 'ready',
        updatedAt: new Date().toISOString(),
        source: 'figma-plugin',
        width: Math.max(1, round(rootBox.width)),
        height: Math.max(1, round(rootBox.height)),
        backgroundColor: bgColor,
        screenshotDataUrl: screenshotDataUrl,
        root: root,
        tokens: tokens,
        tokenModes: vars.variableModes.length > 1 ? vars.variableModes : undefined,
        annotations: state.annotations.length ? state.annotations : undefined,
        assets: state.assets
      };

      figma.ui.postMessage({
        type: 'extracted',
        mode: msg.mode,
        bundle: bundle,
        layerCount: state.count
      });
    } catch (e) {
      figma.ui.postMessage({
        type: 'error',
        message: e && e.message ? e.message : 'Extraction failed'
      });
    }
  }
};
