/* =====================================================================
 * DevReady Inspect — a Dev-Mode-style inspector that only unlocks specs
 * & code when a design is marked "Ready for dev" (or "Completed").
 *
 * Runs in:
 *   • Figma Design mode  (full UI + can mark ready / draw redlines)
 *   • Figma Dev Mode     (Inspect panel plugin, read-only)
 *   • Dev Mode Codegen   (native "Code" section language dropdown)
 *
 * Plain JS, no build step. Kept to ES2017-ish syntax for the plugin sandbox.
 * ===================================================================== */

const NS = 'devready'; // shared plugin data namespace
const IS_DEV = figma.editorType === 'dev';
const DEFAULT_SETTINGS = {
  gate: 'strict',        // 'strict' = only dev-ready designs, 'off' = always inspect
  unit: 'px',            // 'px' | 'rem'
  remBase: 16,
  colorFormat: 'hex',    // 'hex' | 'rgb' | 'hsl'
  pluginFlag: true       // also accept the plugin's own "ready" flag (for free plans / Dev Mode)
};
let settings = Object.assign({}, DEFAULT_SETTINGS);

/* ------------------------------------------------------------------ */
/* Small utils                                                         */
/* ------------------------------------------------------------------ */
function round(n, d) {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  const p = Math.pow(10, d === undefined ? 2 : d);
  return Math.round(n * p) / p;
}
function to255(v) { return Math.round(v * 255); }
function hex2(v) { const s = to255(v).toString(16); return s.length === 1 ? '0' + s : s; }
function colorHex(c, a) {
  let h = '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  if (a !== undefined && a < 1) h += hex2(a);
  return h.toUpperCase();
}
function slug(s) {
  return String(s || 'layer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'layer';
}
function pascal(s) {
  const p = String(s || 'Component')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[A-Z]/.test(p) ? p : 'C' + p;
}
function isMixed(v) { return typeof v === 'symbol'; }
function remify(value, unit, base) {
  if (unit !== 'rem') return value;
  return String(value).replace(/(-?\d*\.?\d+)px/g, function (m, num) {
    const n = parseFloat(num);
    if (Math.abs(n) <= 1) return m; // keep hairlines in px
    return round(n / base, 4) + 'rem';
  });
}

/* ------------------------------------------------------------------ */
/* Dev status (the gate)                                               */
/* ------------------------------------------------------------------ */
function ownStatus(node) {
  try {
    if ('devStatus' in node && node.devStatus) {
      return { type: node.devStatus.type, description: node.devStatus.description || '', source: 'figma' };
    }
  } catch (e) { /* not supported on this node */ }
  if (settings.pluginFlag) {
    try {
      const f = node.getSharedPluginData(NS, 'status');
      if (f) {
        return {
          type: f,
          description: node.getSharedPluginData(NS, 'note') || '',
          at: node.getSharedPluginData(NS, 'at') || '',
          source: 'plugin'
        };
      }
    } catch (e) { /* ignore */ }
  }
  return null;
}

/** Walk up from node to the page; first ancestor with a status wins. */
function findDevStatus(node) {
  let n = node;
  while (n && n.type !== 'PAGE' && n.type !== 'DOCUMENT') {
    const s = ownStatus(n);
    if (s) return Object.assign({ nodeId: n.id, nodeName: n.name, nodeType: n.type }, s);
    n = n.parent;
  }
  return null;
}

const MARKABLE = { FRAME: 1, COMPONENT: 1, COMPONENT_SET: 1, INSTANCE: 1, SECTION: 1 };
/** Figma only allows devStatus on nodes directly under a page or a section. */
function markTarget(node) {
  let n = node;
  while (n && n.parent) {
    const pt = n.parent.type;
    if ((pt === 'PAGE' || pt === 'SECTION') && MARKABLE[n.type]) return n;
    n = n.parent;
  }
  return null;
}

async function setReady(nodeId, type, note) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) return { ok: false, error: 'Layer not found' };
  const target = markTarget(node);
  if (!target) return { ok: false, error: 'Select a frame, component or section that sits directly on the page or inside a section.' };

  let native = false;
  if (!IS_DEV) {
    try {
      if (type) {
        const ds = { type: type };
        if (note) ds.description = note;
        target.devStatus = ds;
      } else {
        target.devStatus = null;
      }
      native = true;
    } catch (e) {
      native = false; // e.g. free plan, nested status, or restricted
    }
  }
  // Plugin flag (works on any plan and in Dev Mode, since pluginData is writable there)
  target.setSharedPluginData(NS, 'status', native ? '' : (type || ''));
  target.setSharedPluginData(NS, 'note', native ? '' : (note || ''));
  target.setSharedPluginData(NS, 'at', type && !native ? new Date().toISOString() : '');
  try { target.setRelaunchData(type ? { open: 'Dev ready — inspect specs & code' } : {}); } catch (e) { /* ignore */ }
  // Change tracking: snapshot the design when it's handed off
  try {
    if (type === 'READY_FOR_DEV') saveBaseline(target);
    else if (!type) { writeChunked(target, 'baseline', ''); target.setSharedPluginData(NS, 'baselineAt', ''); diffCache[target.id] = null; }
  } catch (e) { /* ignore */ }
  return { ok: true, native: native, name: target.name };
}

/** All designs with a status on the current page (top level + inside sections). */
function listReady() {
  const out = [];
  function visit(parent, depth) {
    if (!('children' in parent) || depth > 4) return;
    for (const n of parent.children) {
      const s = ownStatus(n);
      if (s) out.push({ id: n.id, name: n.name, type: n.type, status: s.type, note: s.description, source: s.source });
      if (n.type === 'SECTION') visit(n, depth + 1);
    }
  }
  visit(figma.currentPage, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Variables & styles                                                  */
/* ------------------------------------------------------------------ */
const varCache = {};
async function varInfo(id) {
  if (!id) return null;
  if (varCache[id] !== undefined) return varCache[id];
  let info = null;
  try {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) {
      let coll = '';
      try {
        const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
        coll = c ? c.name : '';
      } catch (e) { /* remote */ }
      info = {
        name: v.name,
        collection: coll,
        type: v.resolvedType,
        web: (v.codeSyntax && v.codeSyntax.WEB) || ''
      };
    }
  } catch (e) { /* ignore */ }
  varCache[id] = info;
  return info;
}
const styleCache = {};
async function styleName(id) {
  if (!id || typeof id !== 'string') return null;
  if (styleCache[id] !== undefined) return styleCache[id];
  let name = null;
  try {
    const st = await figma.getStyleByIdAsync(id);
    name = st ? st.name : null;
  } catch (e) { /* ignore */ }
  styleCache[id] = name;
  return name;
}

/* ------------------------------------------------------------------ */
/* Spec extraction                                                     */
/* ------------------------------------------------------------------ */
function rgbaObj(c, a) { return { r: c.r, g: c.g, b: c.b, a: a === undefined ? 1 : round(a, 3) }; }

async function serializePaint(p) {
  const o = { type: p.type, visible: p.visible !== false, opacity: p.opacity === undefined ? 1 : round(p.opacity, 3) };
  if (p.blendMode && p.blendMode !== 'NORMAL') o.blendMode = p.blendMode;
  if (p.type === 'SOLID') {
    o.color = rgbaObj(p.color, o.opacity);
    if (p.boundVariables && p.boundVariables.color) o.variable = await varModes(p.boundVariables.color.id);
  } else if (p.type.indexOf('GRADIENT') === 0) {
    o.stops = p.gradientStops.map(s => ({ color: rgbaObj(s.color, s.color.a * o.opacity), position: round(s.position * 100, 1) }));
  } else if (p.type === 'IMAGE') {
    o.scaleMode = p.scaleMode;
  }
  return o;
}

function computeBox(node) {
  const box = { margin: null, padding: null };
  const nb = node.absoluteBoundingBox;
  const parent = node.parent;
  const pb = parent && 'absoluteBoundingBox' in parent ? parent.absoluteBoundingBox : null;
  if (nb && pb) {
    box.margin = {
      top: round(nb.y - pb.y),
      left: round(nb.x - pb.x),
      right: round(pb.x + pb.width - (nb.x + nb.width)),
      bottom: round(pb.y + pb.height - (nb.y + nb.height))
    };
    box.parentName = parent.name;
  }
  if ('paddingTop' in node) {
    box.padding = { top: node.paddingTop, right: node.paddingRight, bottom: node.paddingBottom, left: node.paddingLeft };
  }
  return box;
}

function fmtLineHeight(lh) {
  if (!lh || isMixed(lh)) return 'Mixed';
  if (lh.unit === 'AUTO') return 'Auto';
  if (lh.unit === 'PERCENT') return round(lh.value, 1) + '%';
  return round(lh.value, 2) + 'px';
}
function fmtLetterSpacing(ls) {
  if (!ls || isMixed(ls)) return 'Mixed';
  if (ls.unit === 'PERCENT') return round(ls.value, 2) + '%';
  return round(ls.value, 2) + 'px';
}

async function extractSpec(node) {
  const s = { id: node.id, name: node.name, type: node.type };
  s.size = { w: round(node.width), h: round(node.height) };
  s.pos = { x: round(node.x), y: round(node.y) };
  if ('rotation' in node && node.rotation) s.rotation = round(node.rotation);
  if ('opacity' in node && node.opacity < 1) s.opacity = round(node.opacity);
  if ('blendMode' in node && node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') s.blendMode = node.blendMode;
  if ('clipsContent' in node && node.clipsContent) s.clips = true;
  s.box = computeBox(node);

  // Auto layout
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    s.layout = {
      mode: node.layoutMode,
      wrap: node.layoutWrap === 'WRAP',
      gap: node.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 'auto' : node.itemSpacing,
      crossGap: node.layoutWrap === 'WRAP' ? node.counterAxisSpacing : null,
      primary: node.primaryAxisAlignItems,
      counter: node.counterAxisAlignItems,
      padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft]
    };
    if (node.layoutMode === 'GRID') s.layout.grid = { rows: node.gridRowCount, cols: node.gridColumnCount };
  }
  try {
    if ('layoutSizingHorizontal' in node) s.sizing = { h: node.layoutSizingHorizontal, v: node.layoutSizingVertical };
  } catch (e) { /* not applicable */ }
  try {
    if ('layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE') s.absolute = true;
  } catch (e) { /* ignore */ }
  const mm = {};
  ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'].forEach(k => {
    try { if (k in node && node[k] !== null && node[k] !== undefined) mm[k] = node[k]; } catch (e) { /* ignore */ }
  });
  if (Object.keys(mm).length) s.constraints = mm;

  // Radius
  if ('cornerRadius' in node) {
    if (isMixed(node.cornerRadius)) {
      s.radius = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
    } else if (node.cornerRadius) {
      s.radius = [node.cornerRadius];
    }
  }

  // Fills / strokes / effects
  if ('fills' in node && !isMixed(node.fills)) {
    s.fills = [];
    for (const p of node.fills) if (p.visible !== false) s.fills.push(await serializePaint(p));
    s.fillStyle = await styleName(node.fillStyleId);
  }
  if ('strokes' in node && node.strokes.length) {
    s.strokes = [];
    for (const p of node.strokes) if (p.visible !== false) s.strokes.push(await serializePaint(p));
    s.strokeStyle = await styleName(node.strokeStyleId);
    let weight = node.strokeWeight;
    if (isMixed(weight)) weight = [node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight].join(' ');
    s.strokeInfo = {
      weight: weight,
      align: node.strokeAlign,
      dash: 'dashPattern' in node && node.dashPattern.length ? node.dashPattern.join(', ') : ''
    };
  }
  if ('effects' in node && node.effects.length) {
    s.effects = node.effects.filter(e => e.visible !== false).map(e => ({
      type: e.type,
      color: e.color ? rgbaObj(e.color, e.color.a) : null,
      x: e.offset ? e.offset.x : null,
      y: e.offset ? e.offset.y : null,
      radius: e.radius,
      spread: e.spread || 0
    }));
    s.effectStyle = await styleName(node.effectStyleId);
  }

  // Typography
  if (node.type === 'TEXT') {
    const segs = node.getStyledTextSegments([
      'fontName', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'fills', 'textDecoration', 'textCase', 'textStyleId'
    ]);
    const out = [];
    for (const seg of segs.slice(0, 12)) {
      const solid = seg.fills.find(f => f.type === 'SOLID' && f.visible !== false);
      let colorVar = null;
      if (solid && solid.boundVariables && solid.boundVariables.color) colorVar = await varInfo(solid.boundVariables.color.id);
      out.push({
        text: seg.characters.slice(0, 60),
        family: seg.fontName.family,
        style: seg.fontName.style,
        size: seg.fontSize,
        weight: seg.fontWeight,
        lineHeight: fmtLineHeight(seg.lineHeight),
        letterSpacing: fmtLetterSpacing(seg.letterSpacing),
        decoration: seg.textDecoration,
        textCase: seg.textCase,
        color: solid ? rgbaObj(solid.color, solid.opacity === undefined ? 1 : solid.opacity) : null,
        colorVar: colorVar,
        styleName: await styleName(seg.textStyleId)
      });
    }
    s.text = {
      characters: node.characters.slice(0, 4000),
      align: node.textAlignHorizontal,
      valign: node.textAlignVertical,
      autoResize: node.textAutoResize,
      paragraphSpacing: node.paragraphSpacing,
      segments: out,
      more: segs.length > 12 ? segs.length - 12 : 0
    };
  }

  // Bound variables (tokens) on the node itself
  s.tokens = [];
  try {
    const bv = node.boundVariables || {};
    for (const key of Object.keys(bv)) {
      const val = bv[key];
      const list = Array.isArray(val) ? val : (val && val.id ? [val] : []);
      for (const alias of list) {
        if (!alias || !alias.id) continue;
        const info = await varModes(alias.id);
        if (info) s.tokens.push({ property: key, name: info.name, collection: info.collection, web: info.web, type: info.type, modes: modeList(info) });
      }
    }
    // also paint-level variables
    (s.fills || []).concat(s.strokes || []).forEach(p => {
      if (p.variable) s.tokens.push({ property: 'color', name: p.variable.name, collection: p.variable.collection, web: p.variable.web, type: 'COLOR', modes: modeList(p.variable) });
    });
    // de-dupe
    const seen = {};
    s.tokens = s.tokens.filter(t => { const k = t.property + t.name; if (seen[k]) return false; seen[k] = 1; return true; });
  } catch (e) { /* ignore */ }

  // Resolved mode for this layer (explicit or inherited)
  try {
    const em = node.explicitVariableModes || {};
    const ids = Object.keys(em);
    if (ids.length) {
      s.explicitModes = [];
      for (const cid of ids) { const c = await getColl(cid); if (c) { const m = c.modes.find(x => x.modeId === em[cid]); s.explicitModes.push({ collection: c.name, mode: m ? m.name : em[cid] }); } }
    }
  } catch (e) { /* ignore */ }

  // Components
  try {
    if (node.type === 'INSTANCE') {
      const main = await node.getMainComponentAsync();
      if (main) {
        const inSet = main.parent && main.parent.type === 'COMPONENT_SET';
        s.component = {
          kind: 'Instance',
          name: inSet ? main.parent.name : main.name,
          variant: inSet ? main.name : '',
          description: main.description || (inSet ? main.parent.description : '') || '',
          remote: main.remote,
          mainId: main.remote ? null : main.id,
          mapKey: (inSet ? main.parent.key : main.key) || main.id,
          props: []
        };
        const props = node.componentProperties || {};
        for (const k of Object.keys(props)) {
          let value = props[k].value;
          if (props[k].type === 'INSTANCE_SWAP') {
            try { const sw = await figma.getNodeByIdAsync(String(value)); if (sw) value = sw.name; } catch (e) { /* ignore */ }
          }
          s.component.props.push({ name: k.split('#')[0], type: props[k].type, value: String(value) });
        }
      }
    } else if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const inSet = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET';
      s.component = { kind: node.type === 'COMPONENT' ? 'Main component' : 'Component set', name: inSet ? node.parent.name : node.name, inSet: inSet, variant: inSet ? node.name : '', description: node.description || (inSet ? node.parent.description : '') || '', props: [] };
      try {
        const defs = node.componentPropertyDefinitions || {};
        for (const k of Object.keys(defs)) {
          s.component.props.push({ name: k.split('#')[0], type: defs[k].type, value: String(defs[k].defaultValue) + (defs[k].variantOptions ? ' (' + defs[k].variantOptions.join(' | ') + ')' : '') });
        }
      } catch (e) { /* ignore */ }
    }
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const set = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET' ? node.parent : null;
      s.component.mapKey = (set ? set.key : node.key) || node.id;
    }
    if (s.component && s.component.mapKey) {
      const raw = figma.root.getSharedPluginData(NS, 'map:' + s.component.mapKey);
      if (raw) {
        try {
          s.component.map = JSON.parse(raw);
          const pr = s.component.kind === 'Instance' ? s.component.props.map(p => ({ name: p.name, type: p.type, value: p.type === 'BOOLEAN' ? p.value === 'true' : p.value })) : [];
          s.component.snippet = connectSnippet(s.component.map, pr);
        } catch (e) { /* ignore */ }
      }
      s.component.suggest = { name: pascal(cleanName(s.component.name) || 'Component'), path: '@/components/' + (cleanName(s.component.name) || 'component') };
    }
    if (s.component && 'documentationLinks' in node && node.documentationLinks && node.documentationLinks.length) {
      s.component.docs = node.documentationLinks.map(l => l.uri);
    }
  } catch (e) { /* ignore */ }

  // Annotations & dev resources (Dev Mode metadata)
  try {
    if ('annotations' in node && node.annotations && node.annotations.length) {
      s.annotations = node.annotations.map((a, i) => ({
        index: i,
        label: a.labelMarkdown || a.label || '',
        properties: (a.properties || []).map(p => p.type),
        categoryId: a.categoryId || ''
      }));
    }
  } catch (e) { /* ignore */ }
  try {
    if ('getDevResourcesAsync' in node) {
      const res = await node.getDevResourcesAsync();
      if (res && res.length) s.devResources = res.map(r => ({ name: r.name, url: r.url }));
    }
  } catch (e) { /* ignore */ }

  s.canAnnotate = 'annotations' in node;
  if (s.canAnnotate || s.annotations) s.annCats = await annCategories();
  s.annNoteCount = IS_DEV ? 0 : canvasNotesFor(node.id).length;
  try { s.interactions = await interactionsOf(node); } catch (e) { /* ignore */ }
  try {
    if (node.type === 'INSTANCE' && s.component && 'overrides' in node && node.overrides && node.overrides.length) {
      s.component.overrideCount = node.overrides.length;
      s.component.overrides = [];
      for (const o of node.overrides.slice(0, 12)) {
        let name = o.id;
        try { const on = await figma.getNodeByIdAsync(o.id); if (on) name = on.id === node.id ? node.name + ' (this layer)' : on.name; } catch (e) { /* ignore */ }
        s.component.overrides.push({ id: o.id, name: name, fields: o.overriddenFields || [] });
      }
    }
  } catch (e) { /* ignore */ }
  s.canMeasure = !!MEASURABLE[node.type] && 'addMeasurement' in figma.currentPage;
  s.layers = layersInfo(node);
  return s;
}
function modeList(info) {
  if (!info || !info.modes || info.modes.length < 2) return null;
  return info.modes.map(m => ({ name: m.name, display: m.display, color: m.color, alias: m.alias, isDefault: m.isDefault }));
}

/* ------------------------------------------------------------------ */
/* CSS + Tailwind generation                                           */
/* ------------------------------------------------------------------ */
async function safeCSS(node) {
  try { return await node.getCSSAsync(); } catch (e) { return {}; }
}
function cssObjToString(obj, unit, base, indent) {
  const pad = indent || '';
  return Object.keys(obj).map(k => pad + k + ': ' + remify(obj[k], unit, base) + ';').join('\n');
}

const CSS_GROUPS = [
  ['Auto layout', /^(display|flex-direction|flex-wrap|justify-content|align-items|align-content|gap|row-gap|column-gap|padding(-.*)?)$/],
  ['Layout', /^(position|top|left|right|bottom|width|height|min-.*|max-.*|flex|flex-grow|flex-shrink|flex-basis|align-self|aspect-ratio|overflow|transform|z-index)$/],
  ['Typography', /^(color|font.*|line-height|letter-spacing|text-.*|white-space|-webkit-.*|leading-trim|word-.*|font-feature-settings)$/],
  ['Style', /.*/]
];
/** Dev-Mode-like CSS: grouped with comments. */
function groupedCSS(obj, unit, base, typeComment) {
  const buckets = CSS_GROUPS.map(() => []);
  Object.keys(obj).forEach(k => {
    for (let i = 0; i < CSS_GROUPS.length; i++) {
      if (CSS_GROUPS[i][1].test(k)) { buckets[i].push(k + ': ' + remify(obj[k], unit, base) + ';'); break; }
    }
  });
  const out = [];
  buckets.forEach((lines, i) => {
    if (!lines.length) return;
    let title = CSS_GROUPS[i][0];
    if (title === 'Typography' && typeComment) title = typeComment;
    if (out.length) out.push('');
    out.push('/* ' + title + ' */');
    out.push.apply(out, lines);
  });
  return out.join('\n');
}

const SP = { 0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5', 12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8', 36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20', 96: '24', 112: '28', 128: '32', 144: '36', 160: '40', 176: '44', 192: '48', 208: '52', 224: '56', 240: '60', 256: '64', 288: '72', 320: '80', 384: '96' };
const FS = { 12: 'xs', 14: 'sm', 16: 'base', 18: 'lg', 20: 'xl', 24: '2xl', 30: '3xl', 36: '4xl', 48: '5xl', 60: '6xl', 72: '7xl', 96: '8xl', 128: '9xl' };
const FW = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
const RAD = { 0: 'none', 2: 'sm', 4: '', 6: 'md', 8: 'lg', 12: 'xl', 16: '2xl', 24: '3xl' };
const JUST = { 'flex-start': 'start', 'center': 'center', 'flex-end': 'end', 'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly', 'stretch': 'stretch', 'baseline': 'baseline', 'start': 'start', 'end': 'end' };

function pxNum(v) { const m = /^(-?\d*\.?\d+)px$/.exec(String(v).trim()); return m ? parseFloat(m[1]) : null; }

function cssToTailwind(css, unit, base) {
  const cls = [];
  const arb = v => remify(String(v), unit, base).replace(/\s*,\s*/g, ',').replace(/\s+/g, '_');
  const spc = (prefix, v) => {
    if (String(v).trim() === '0') return prefix + '-0';
    const n = pxNum(v);
    if (n !== null && SP[n] !== undefined) return prefix + '-' + SP[n];
    if (n !== null && n < 0 && SP[-n] !== undefined) return '-' + prefix + '-' + SP[-n];
    return prefix + '-[' + arb(v) + ']';
  };
  const size = (prefix, v) => {
    if (v === '100%') return prefix + '-full';
    if (v === 'fit-content') return prefix + '-fit';
    if (v === 'auto') return prefix + '-auto';
    return spc(prefix, v);
  };
  const isVar = v => /^var\(/.test(String(v).trim());

  css = Object.assign({}, css);
  Object.keys(css).forEach(k => { css[k] = String(css[k]).replace(/\/\*[\s\S]*?\*\//g, '').trim(); if (!css[k] || (k === 'font-style' && css[k] === 'normal')) delete css[k]; });
  // width === height on the spacing scale → size-*
  if (css.width && css.width === css.height && pxNum(css.width) !== null && SP[pxNum(css.width)] !== undefined) {
    cls.push('size-' + SP[pxNum(css.width)]);
    delete css.width; delete css.height;
  }
  for (const prop of Object.keys(css)) {
    const v = String(css[prop]).trim();
    switch (prop) {
      case 'list-style': cls.push(v === 'none' ? 'list-none' : '[list-style:' + arb(v) + ']'); break;
      case 'margin': cls.push(v === '0' || v === '0px' ? 'm-0' : spc('m', v)); break;
      case 'display':
        if (v === 'flex' || v === 'inline-flex' || v === 'grid' || v === 'block' || v === 'inline-block' || v === 'none') cls.push(v === 'none' ? 'hidden' : v);
        else cls.push('[display:' + arb(v) + ']');
        break;
      case 'flex-direction': cls.push(v === 'column' ? 'flex-col' : v === 'row' ? 'flex-row' : 'flex-' + v); break;
      case 'justify-content': cls.push(JUST[v] ? 'justify-' + JUST[v] : '[justify-content:' + arb(v) + ']'); break;
      case 'align-items': cls.push(JUST[v] ? 'items-' + JUST[v] : '[align-items:' + arb(v) + ']'); break;
      case 'align-content': cls.push(JUST[v] ? 'content-' + JUST[v] : '[align-content:' + arb(v) + ']'); break;
      case 'align-self': cls.push(JUST[v] ? 'self-' + JUST[v] : '[align-self:' + arb(v) + ']'); break;
      case 'flex':
        if (v === '1 0 0' || v === '1 0 0%') cls.push('grow', 'shrink-0', 'basis-0');
        else if (v === '1' || v === '1 1 0%') cls.push('flex-1');
        else cls.push('flex-[' + arb(v) + ']');
        break;
      case 'flex-grow': cls.push(v === '1' ? 'grow' : v === '0' ? 'grow-0' : 'grow-[' + v + ']'); break;
      case 'flex-shrink': cls.push(v === '0' ? 'shrink-0' : 'shrink'); break;
      case 'flex-wrap': cls.push(v === 'wrap' ? 'flex-wrap' : 'flex-nowrap'); break;
      case 'gap': {
        const parts = v.split(/\s+(?![^(]*\))/);
        if (parts.length === 2) cls.push(spc('gap-y', parts[0]), spc('gap-x', parts[1]));
        else cls.push(spc('gap', v));
        break;
      }
      case 'row-gap': cls.push(spc('gap-y', v)); break;
      case 'column-gap': cls.push(spc('gap-x', v)); break;
      case 'padding': {
        const p = v.split(/\s+(?![^(]*\))/);
        const [t, r, b, l] = p.length === 1 ? [p[0], p[0], p[0], p[0]] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p.length === 3 ? [p[0], p[1], p[2], p[1]] : p;
        if (t === r && r === b && b === l) cls.push(spc('p', t));
        else if (t === b && l === r) cls.push(spc('px', l), spc('py', t));
        else cls.push(spc('pt', t), spc('pr', r), spc('pb', b), spc('pl', l));
        break;
      }
      case 'padding-top': cls.push(spc('pt', v)); break;
      case 'padding-right': cls.push(spc('pr', v)); break;
      case 'padding-bottom': cls.push(spc('pb', v)); break;
      case 'padding-left': cls.push(spc('pl', v)); break;
      case 'width': cls.push(size('w', v)); break;
      case 'height': cls.push(size('h', v)); break;
      case 'min-width': cls.push(size('min-w', v)); break;
      case 'max-width': cls.push(size('max-w', v)); break;
      case 'min-height': cls.push(size('min-h', v)); break;
      case 'max-height': cls.push(size('max-h', v)); break;
      case 'position': cls.push(v); break;
      case 'top': case 'left': case 'right': case 'bottom': cls.push(spc(prop, v)); break;
      case 'background':
      case 'background-color':
        if (/gradient|url\(/.test(v) || v.indexOf(',') > -1 && !isVar(v)) cls.push('[background:' + arb(v) + ']');
        else cls.push('bg-[' + arb(v) + ']');
        break;
      case 'color': cls.push(isVar(v) ? 'text-[color:' + arb(v) + ']' : 'text-[' + arb(v) + ']'); break;
      case 'font-family': {
        const fam = v.replace(/^var\([^,]+,\s*/, '').replace(/\)$/, '').split(',')[0].replace(/["']/g, '').trim();
        cls.push("font-['" + fam.replace(/\s+/g, '_') + "']");
        break;
      }
      case 'font-size': {
        const n = pxNum(v);
        if (n !== null && FS[n]) cls.push('text-' + FS[n]);
        else cls.push(isVar(v) ? 'text-[length:' + arb(v) + ']' : 'text-[' + arb(v) + ']');
        break;
      }
      case 'font-weight': cls.push(FW[v] ? 'font-' + FW[v] : 'font-[' + arb(v) + ']'); break;
      case 'font-style': if (v === 'italic') cls.push('italic'); break;
      case 'line-height': cls.push(v === 'normal' ? 'leading-normal' : 'leading-[' + arb(v) + ']'); break;
      case 'letter-spacing': cls.push('tracking-[' + arb(v) + ']'); break;
      case 'text-align': cls.push('text-' + v); break;
      case 'text-transform': if (v !== 'none') cls.push(v === 'capitalize' ? 'capitalize' : v); break;
      case 'text-decoration-line':
      case 'text-decoration':
        if (/underline/.test(v)) cls.push('underline');
        else if (/line-through/.test(v)) cls.push('line-through');
        break;
      case 'border-radius': {
        const n = pxNum(v);
        if (n !== null && RAD[n] !== undefined) cls.push(RAD[n] ? 'rounded-' + RAD[n] : 'rounded');
        else if (n !== null && n >= 999) cls.push('rounded-full');
        else cls.push('rounded-[' + arb(v) + ']');
        break;
      }
      case 'border': {
        const m = /^(\d*\.?\d+px)\s+(solid|dashed|dotted)\s+(.+)$/.exec(v);
        if (m) {
          cls.push(m[1] === '1px' ? 'border' : 'border-[' + m[1] + ']');
          if (m[2] !== 'solid') cls.push('border-' + m[2]);
          cls.push('border-[' + arb(m[3]) + ']');
        } else cls.push('[border:' + arb(v) + ']');
        break;
      }
      case 'box-shadow': cls.push('shadow-[' + arb(v) + ']'); break;
      case 'opacity': cls.push('opacity-[' + v + ']'); break;
      case 'overflow': cls.push('overflow-' + v); break;
      case 'mix-blend-mode': cls.push('mix-blend-' + v); break;
      case 'backdrop-filter': {
        const m = /^blur\((.+)\)$/.exec(v);
        cls.push(m ? 'backdrop-blur-[' + arb(m[1]) + ']' : '[backdrop-filter:' + arb(v) + ']');
        break;
      }
      case 'filter': {
        const m = /^blur\((.+)\)$/.exec(v);
        cls.push(m ? 'blur-[' + arb(m[1]) + ']' : '[filter:' + arb(v) + ']');
        break;
      }
      case 'aspect-ratio': cls.push('aspect-[' + arb(v.replace(/\s*\/\s*/, '/')) + ']'); break;
      case 'object-fit': cls.push('object-' + v); break;
      case 'white-space': cls.push(v === 'nowrap' ? 'whitespace-nowrap' : 'whitespace-' + v); break;
      case 'text-overflow': if (v === 'ellipsis') cls.push('text-ellipsis'); break;
      case '-webkit-line-clamp': cls.push('line-clamp-' + v); break;
      case '-webkit-box-orient': case 'display-webkit': break;
      default:
        cls.push('[' + prop + ':' + arb(v) + ']');
    }
  }
  return cls.filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Asset detection                                                     */
/* ------------------------------------------------------------------ */
const VECTORISH = { VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, LINE: 1, ELLIPSE: 1, POLYGON: 1, RECTANGLE: 1 };
function allVector(n) {
  if (!('children' in n)) return !!VECTORISH[n.type];
  if (n.type === 'BOOLEAN_OPERATION') return true;
  for (const c of n.children) { if (!allVector(c)) return false; }
  return n.children.length > 0;
}
function hasImageFill(n) {
  return 'fills' in n && !isMixed(n.fills) && n.fills.some(f => f.type === 'IMAGE' && f.visible !== false);
}
function isIconLike(n) {
  if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION' || n.type === 'STAR' || n.type === 'POLYGON') return true;
  if ((n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE' || n.type === 'COMPONENT') &&
      'children' in n && n.children.length && n.width <= 128 && n.height <= 128) {
    return allVector(n) && !hasImageFill(n);
  }
  return false;
}
function collectAssets(root, limit) {
  const out = [];
  let visited = 0;
  (function walk(n) {
    if (out.length >= limit || visited++ > 4000) return;
    if (n.visible === false) return;
    const hasExport = 'exportSettings' in n && n.exportSettings.length > 0;
    if (hasExport) {
      out.push({ id: n.id, name: n.name, type: n.type, kind: 'export', formats: n.exportSettings.map(e => e.format + (e.constraint && e.constraint.type === 'SCALE' && e.constraint.value !== 1 ? '@' + e.constraint.value + 'x' : '')), w: round(n.width), h: round(n.height) });
      return;
    }
    if (n !== root && isIconLike(n)) { out.push({ id: n.id, name: n.name, type: n.type, kind: 'icon', w: round(n.width), h: round(n.height) }); return; }
    if (hasImageFill(n)) out.push({ id: n.id, name: n.name, type: n.type, kind: 'image', w: round(n.width), h: round(n.height) });
    if ('children' in n) for (const c of n.children) walk(c);
  })(root);
  return out;
}

async function exportNode(id, format, scale) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node || !('exportAsync' in node)) throw new Error('Cannot export this layer');
  const opts = { format: format };
  if (format === 'PNG' || format === 'JPG') opts.constraint = { type: 'SCALE', value: scale || 1 };
  if (format === 'SVG') opts.svgOutlineText = true;
  const bytes = await node.exportAsync(opts);
  const ext = format.toLowerCase();
  const suffix = (format === 'PNG' || format === 'JPG') && scale && scale !== 1 ? '@' + scale + 'x' : '';
  return { name: slug(node.name) + suffix + '.' + ext, bytes: bytes };
}

/* ------------------------------------------------------------------ */
/* CODE ENGINE — Figma tree → clean, production-style code             */
/*  • semantic BEM class names (no "frame-2121453060")                 */
/*  • shared classes for identical styles, component extraction (React)*/
/*  • CSS variables collected into :root, fonts hoisted, scoped reset  */
/*  • icons exported as assets, lists → ul/li, buttons → <button>      */
/* ------------------------------------------------------------------ */
const GENERIC_NAME = /^(frame|group|rectangle|rect|ellipse|vector|line|polygon|star|container|auto ?layout|component|instance|layer|union|subtract|intersect|exclude|mask|image|img|shape|path|wrapper|div|box|copy|selection|untitled)([\s_-]*(copy|\d+))*$/i;

function isNumericText(s) {
  return /^[\s+\-–−]*[$₹€£¥]?\s*[\d][\d.,]*\s*[%kKmMbBx+]?\s*$/.test(String(s).trim());
}
function cleanName(s) {
  if (!s) return '';
  const last = String(s).split('/').pop();
  const n = slug(last.replace(/=/g, ' ')).replace(/^[\d-]+/, '');
  return n.length > 32 ? n.slice(0, 32).replace(/-[^-]*$/, '') : n;
}
function camel(s) {
  const p = String(s || '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/);
  const out = p.map((w, i) => i ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()).join('');
  return /^[a-zA-Z_]/.test(out) ? out : 'v' + out;
}
function nodeIsGeneric(node) {
  const n = String(node.name || '').trim();
  if (!n || GENERIC_NAME.test(n)) return true;
  if (/^[\d\s.,:%+\-–—$₹€£#()]+$/.test(n)) return true;
  if (/\d{5,}/.test(n)) return true; // "Frame 2121453060", imported ids
  if (node.type === 'TEXT') {
    try { if (node.autoRename) return true; } catch (e) { /* ignore */ }
    if (n === String(node.characters).trim().slice(0, n.length)) return true;
  }
  return false;
}
function cleanCss(raw) {
  const o = {};
  Object.keys(raw || {}).forEach(k => {
    let v = String(raw[k]).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!v) return;
    if (k === 'font-style' && v === 'normal') return;
    o[k] = v;
  });
  return o;
}
const LAYOUT_KEYS = ['position', 'left', 'top', 'right', 'bottom', 'flex-shrink', 'align-self', 'flex', 'opacity'];

async function compInfo(node) {
  if (node.type !== 'INSTANCE') return null;
  try {
    const main = await node.getMainComponentAsync();
    if (!main) return null;
    const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
    let props = [];
    try {
      const cp = node.componentProperties || {};
      props = Object.keys(cp).map(k => ({ name: k.split('#')[0], type: cp[k].type, value: cp[k].value }));
    } catch (e) { /* ignore */ }
    return { key: main.id, mapKey: (set ? set.key : main.key) || main.id, name: set ? set.name : main.name, variant: set ? main.name : '', props: props, remote: !!main.remote };
  } catch (e) { return null; }
}
function variantSlug(v) {
  if (!v) return '';
  return slug(v.split(/,\s*/).map(kv => kv.split('=')[1] || kv).filter(x => !/^(default|false|off|none)$/i.test(x)).join(' '));
}

function textRuns(node) {
  let segs;
  try { segs = node.getStyledTextSegments(['fontWeight', 'fontSize', 'fills', 'textDecoration', 'fontName']); } catch (e) { return null; }
  if (!segs || segs.length < 2) return null;
  const base = segs[0];
  const col = s => { const f = s.fills.find(p => p.type === 'SOLID' && p.visible !== false); return f ? colorHex(f.color, f.opacity === undefined ? 1 : f.opacity) : null; };
  const runs = segs.map(s => {
    const d = {};
    if (s.fontWeight !== base.fontWeight) d['font-weight'] = String(s.fontWeight);
    if (s.fontSize !== base.fontSize) d['font-size'] = round(s.fontSize) + 'px';
    if (col(s) && col(s) !== col(base)) d.color = col(s);
    if (s.textDecoration !== base.textDecoration) d['text-decoration'] = s.textDecoration === 'UNDERLINE' ? 'underline' : s.textDecoration === 'STRIKETHROUGH' ? 'line-through' : 'none';
    if (s.fontName.family !== base.fontName.family) d['font-family'] = '"' + s.fontName.family + '"';
    const it = /italic/i.test(s.fontName.style);
    if (it !== /italic/i.test(base.fontName.style)) d['font-style'] = it ? 'italic' : 'normal';
    return { text: s.characters, css: Object.keys(d).length ? d : null };
  });
  return runs.some(r => r.css) ? runs : null;
}

/* ---------- pass 1: raw tree ---------- */
const isAutoLayout = n => !!n && 'layoutMode' in n && !!n.layoutMode && n.layoutMode !== 'NONE';
/**
 * Geometry from the node itself. getCSSAsync() describes a layer's own styles but not
 * where it sits inside a non-auto-layout frame or group, so without this, free-positioned
 * layers would just stack in normal flow.
 */
function applyGeometry(node, el, isRoot) {
  if (!el) return el;
  const c = el.css;
  const px = v => round(v) + 'px';
  const text = node.type === 'TEXT';
  const ar = text ? node.textAutoResize : null;
  if (text && ar === 'WIDTH_AND_HEIGHT') c['white-space'] = 'nowrap';
  const p = node.parent;
  if (!isRoot && p) {
    const abs = !isAutoLayout(p) || node.layoutPositioning === 'ABSOLUTE';
    const A = node.absoluteBoundingBox, B = p.absoluteBoundingBox;
    if (abs && A && B) {
      ['right', 'bottom', 'inset', 'margin', 'align-self', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis'].forEach(k => delete c[k]);
      const rotated = node.rotation && Math.abs(node.rotation) > 0.01 && el.kind !== 'img';
      c.position = 'absolute';
      if (rotated) { c.left = px(node.x - (p.type === 'GROUP' ? p.x : 0)); c.top = px(node.y - (p.type === 'GROUP' ? p.y : 0)); }
      else { c.left = px(A.x - B.x); c.top = px(A.y - B.y); delete c.transform; }
      if (el.kind !== 'mapped') {
        const w = el.kind === 'img' ? A.width : node.width, h = el.kind === 'img' ? A.height : node.height;
        if (!text || ar === 'NONE' || ar === 'TRUNCATE' || ar === 'HEIGHT') c.width = px(w);
        if (!text || ar === 'NONE' || ar === 'TRUNCATE') c.height = px(h);
      }
    } else if (!abs && el.kind !== 'img') {
      const dir = p.layoutMode, sh = node.layoutSizingHorizontal, sv = node.layoutSizingVertical;
      if (sh === 'FIXED' && !c.width) c.width = px(node.width);
      if (sv === 'FIXED' && !c.height && !text) c.height = px(node.height);
      if (sh === 'FILL') { if (dir === 'HORIZONTAL') { if (!c.flex) c.flex = '1 0 0'; delete c.width; } else { c['align-self'] = 'stretch'; delete c.width; } }
      if (sv === 'FILL') { if (dir === 'VERTICAL') { if (!c.flex) c.flex = '1 0 0'; delete c.height; } else { c['align-self'] = 'stretch'; delete c.height; } }
      if (((sh === 'FIXED' && dir === 'HORIZONTAL') || (sv === 'FIXED' && dir === 'VERTICAL')) && !c.flex && !c['flex-shrink']) c['flex-shrink'] = '0';
    }
  }
  const container = el.kind === 'box' && 'children' in node;
  if (container && !isAutoLayout(node)) {
    if (!c.position) c.position = 'relative';
    if (!c.width) c.width = px(node.width);
    if (!c.height) c.height = px(node.height);
  }
  if (container && node.clipsContent && !c.overflow) c.overflow = 'hidden';
  return el;
}
async function buildRaw(node, ctx, isRoot, inInst) {
  return applyGeometry(node, await buildRawNode(node, ctx, isRoot, inInst), isRoot);
}
async function buildRawNode(node, ctx, isRoot, inInst) {
  if (node.visible === false) return null;
  if (ctx.count >= ctx.max) { ctx.truncated = true; return null; }
  ctx.count++;
  const el = { id: node.id, type: node.type, name: node.name, generic: nodeIsGeneric(node), kind: 'box', tag: 'div', css: {}, children: [], attrs: {}, inInst: !!inInst, w: node.width, h: node.height };
  const rawCss = await safeCSS(node);
  el.css = cleanCss(rawCss);
  if (isRoot) LAYOUT_KEYS.forEach(k => { if (k !== 'opacity') delete el.css[k]; });
  collectVarIds(node, ctx);
  el.comp = await compInfo(node);

  // Code Connect-style mapping: render the mapped code component instead of its internals
  if (!isRoot && ctx.react && el.comp && ctx.mappings[el.comp.mapKey]) {
    const map = ctx.mappings[el.comp.mapKey];
    el.kind = 'mapped'; el.tag = map.name; el.map = map;
    el.mapProps = mapProps(el.comp.props);
    const css = {};
    LAYOUT_KEYS.forEach(k => { if (el.css[k] !== undefined) css[k] = el.css[k]; });
    el.css = css;
    (ctx.imports[map.path] = ctx.imports[map.path] || {})[map.name] = 1;
    return el;
  }

  const hasExport = 'exportSettings' in node && node.exportSettings.length > 0;
  const leafImage = hasImageFill(node) && !('children' in node && node.children.length);
  if (!isRoot && (isIconLike(node) || hasExport || leafImage)) {
    el.kind = 'img'; el.tag = 'img';
    const icon = isIconLike(node);
    const fmt = hasExport ? node.exportSettings[0].format : (icon ? 'SVG' : 'PNG');
    const scale = fmt === 'PNG' || fmt === 'JPG' ? 2 : 1;
    const key = el.comp ? el.comp.key : node.id;
    let file = ctx.assetByKey[key];
    if (!file) {
      let baseName = (el.comp && cleanName(el.comp.variant ? el.comp.name + ' ' + variantSlug(el.comp.variant) : el.comp.name)) ||
        (!el.generic && cleanName(node.name)) || (icon ? 'icon' : 'image');
      let fname = baseName, i = 1;
      while (ctx.assetNames[fname]) fname = baseName + '-' + (++i);
      ctx.assetNames[fname] = 1;
      file = { id: node.id, file: fname + '.' + fmt.toLowerCase(), format: fmt, scale: scale, varName: /(icon|img|image)$/i.test(camel(fname)) ? camel(fname) : camel(fname) + (fmt === 'SVG' ? 'Icon' : 'Img') };
      ctx.assetByKey[key] = file;
      ctx.assets.push(file);
    }
    el.asset = file;
    el.base = icon ? 'icon' : 'image';
    el.attrs.alt = icon ? '' : (el.generic ? '' : node.name);
    const w = node.rotation ? (node.absoluteBoundingBox || node).width : node.width;
    const h = node.rotation ? (node.absoluteBoundingBox || node).height : node.height;
    const css = { width: round(w) + 'px', height: round(h) + 'px' };
    LAYOUT_KEYS.forEach(k => { if (el.css[k] !== undefined) css[k] = el.css[k]; });
    el.css = css; // drop transforms/fills — they're baked into the exported file
    return el;
  }

  if (node.type === 'TEXT') {
    el.kind = 'text';
    el.text = node.characters;
    el.fontSize = isMixed(node.fontSize) ? 16 : node.fontSize;
    el.runs = textRuns(node);
    collectFonts(node, ctx);
    // Inside an instance, read the main component's default text so naming stays
    // consistent across instances ("342" and "Friday" both become __value).
    if (inInst && node.id.indexOf(';') > -1) {
      try {
        const mainText = await figma.getNodeByIdAsync(node.id.split(';').pop());
        if (mainText && mainText.type === 'TEXT') {
          el.mainText = mainText.characters;
          if (el.name === mainText.characters || mainText.autoRename) el.generic = true;
        }
      } catch (e) { /* ignore */ }
    }
    if (!isNumericText(el.text)) ctx.maxFont = Math.max(ctx.maxFont, el.fontSize);
    return el;
  }

  if ('children' in node) {
    const kids = await Promise.all(node.children.map(c => buildRaw(c, ctx, false, inInst || node.type === 'INSTANCE')));
    el.children = kids.filter(Boolean);
  }
  el.isBlock = !isRoot && (node.type === 'INSTANCE' || node.type === 'COMPONENT') && !!(el.comp || !el.generic);
  return el;
}

/* ---------- pass 2: structure, semantics, CSS hygiene ---------- */
function blockTexts(block) {
  if (block._texts) return block._texts;
  const out = [];
  (function w(e) { e.children.forEach(c => { if (c.kind === 'text') out.push(c); else if (!c.isBlock) w(c); }); })(block);
  block._texts = out;
  return out;
}
function textName(el, ctx) {
  if (!el.generic) { const n = cleanName(el.name); if (n) return n; }
  const t = String(el.mainText !== undefined ? el.mainText : el.text).trim();
  if (isNumericText(t)) return /%/.test(t) ? 'change' : 'value';
  const words = t.split(/\s+/).filter(Boolean);
  const texts = blockTexts(el.block).filter(x => !isNumericText(x.mainText !== undefined ? x.mainText : x.text));
  const max = texts.reduce((m, x) => Math.max(m, x.fontSize), 0);
  const min = texts.reduce((m, x) => Math.min(m, x.fontSize), Infinity);
  const isFirstMax = texts.find(x => x.fontSize === max) === el;
  if (isFirstMax && words.length <= 10 && (el.fontSize >= 18 || (texts.length > 1 && el.fontSize > min))) return 'title';
  if (el.inInst) return el.fontSize <= 13 ? 'label' : el.fontSize >= 18 ? 'subtitle' : 'text';
  if (words.length <= 3) { const sl = slug(words.join(' ')); if (sl && sl.length <= 24 && !/^\d/.test(sl)) return sl; }
  if (el.fontSize >= 20) return 'heading';
  if (el.fontSize <= 12) return 'caption';
  return words.length > 12 ? 'description' : 'text';
}
function containerName(el, parent) {
  const c = el.css, kids = el.children;
  const bg = c.background || c['background-color'];
  if (el.tag === 'ul') return 'list';
  if (bg && c['border-radius'] && kids.length && el.h <= 36) return 'badge';
  if (bg && (c['border-radius'] || c['box-shadow'] || c.border) && kids.length) return 'card';
  if (parent && !parent.parent && parent.children[0] === el && c.display === 'flex' && c['flex-direction'] !== 'column' && kids.some(k => k.kind === 'text')) return 'header';
  if (kids.length && kids.every(k => k.kind === 'text')) return kids.length === 1 ? 'label' : 'content';
  if (kids.length === 2 && kids.some(k => k.kind === 'img') && kids.some(k => k.kind === 'text')) return 'item';
  if (!kids.length) return bg ? 'shape' : 'spacer';
  if (c.display === 'flex') return c['flex-direction'] === 'column' ? 'stack' : 'row';
  return 'group';
}
function semanticTag(name) {
  const n = String(name || '').toLowerCase();
  if (/\b(button|btn|cta)\b/.test(n)) return 'button';
  if (/\blink\b/.test(n)) return 'a';
  if (/\b(nav|navbar|navigation|menu bar)\b/.test(n)) return 'nav';
  if (/\bheader\b/.test(n)) return 'header';
  if (/\bfooter\b/.test(n)) return 'footer';
  return null;
}
function structurePass(el, parent, ctx, block) {
  el.parent = parent; el.depth = parent ? parent.depth + 1 : 0; el.block = block || el;
  const pc = parent ? parent.css : null;
  // flex-only props are noise if the parent isn't a flex container
  if (pc && !/flex|grid/.test(pc.display || '')) { delete el.css['flex-shrink']; delete el.css['align-self']; delete el.css.flex; }
  // absolute children need a positioned parent
  if (el.children.some(c => c.css.position === 'absolute') && !el.css.position) el.css.position = 'relative';

  if (el.kind === 'text') {
    el.base = textName(el, ctx);
    const inline = parent && (parent.tag === 'button' || parent.tag === 'a');
    if (inline) el.tag = 'span';
    else if (el.base === 'title' && !el.inInst && !ctx.usedTitle) { ctx.usedTitle = true; el.tag = ctx.rootWidth >= 900 ? 'h1' : 'h2'; }
    else if (el.base === 'title' && el.inInst) el.tag = 'h3';
    else if (el.base === 'heading') el.tag = 'h3';
    else el.tag = 'p';
    return;
  }
  if (el.kind === 'img') return;
  if (el.kind === 'mapped') { el.base = slug(el.map.name) || 'component'; return; }

  const sem = semanticTag(el.comp ? el.comp.name : el.name);
  if (sem) el.tag = sem;
  if (el.tag === 'button') el.attrs.type = 'button';
  if (el.tag === 'a') el.attrs.href = '#';

  // repeated instances of one component → list
  const k = el.children;
  if (k.length >= 3 && k.every(c => c.comp && c.comp.key === k[0].comp.key) && el.tag === 'div') {
    el.tag = 'ul';
    if (!el.css.padding) el.css.padding = '0';
    el.css.margin = '0';
    el.css['list-style'] = 'none';
    k.forEach(c => { if (c.tag === 'div') c.tag = 'li'; });
  }
  const nextBlock = el.isBlock ? el : (block || el);
  el.children.forEach(c => structurePass(c, el, ctx, nextBlock));
  // name containers after children are known (post-order)
  el.base = el.isBlock ? (cleanName(el.generic ? (el.comp && el.comp.name) : el.name) || 'component')
    : (!el.generic && cleanName(el.name)) || containerName(el, parent);
}
function walk(el, fn) { fn(el); el.children.forEach(c => walk(c, fn)); }

function hoistFont(root) {
  const count = {};
  walk(root, e => { const f = e.css['font-family']; if (e.kind === 'text' && f) count[f] = (count[f] || 0) + 1; });
  const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  if (!top) return null;
  walk(root, e => { if (e !== root && e.css['font-family'] === top) delete e.css['font-family']; });
  root.css['font-family'] = top;
  return top;
}
const VAR_RE = /var\((--[A-Za-z0-9_-]+),\s*((?:[^()]|\([^()]*\))*)\)/g;
function collectVars(root, ctx) {
  const fix = css => Object.keys(css).forEach(k => {
    css[k] = css[k].replace(VAR_RE, (m, name, fb) => { if (!ctx.vars[name]) ctx.vars[name] = fb.trim(); return 'var(' + name + ')'; });
  });
  walk(root, e => { fix(e.css); (e.runs || []).forEach(r => r.css && fix(r.css)); });
}

/* ---------- pass 3: BEM naming + class de-duplication ---------- */
function cssKey(css) { return Object.keys(css).sort().map(k => k + ':' + css[k]).join(';'); }
function claim(ctx, base, css, variant) {
  const key = cssKey(css);
  const list = ctx.classes[base] || (ctx.classes[base] = []);
  const hit = list.find(x => x.key === key);
  if (hit) return hit.cls;
  let cls = base;
  if (list.length) {
    const mod = variant ? base + '--' + variant : '';
    cls = mod && !list.some(x => x.cls === mod) ? mod : base + '-' + (list.length + 1);
  }
  list.push({ key: key, cls: cls, css: css });
  ctx.order.push({ cls: cls, css: css });
  return cls;
}
function namePass(el, block, ctx, isRoot) {
  let childBlock = block;
  if (isRoot) { el.cls = claim(ctx, block, el.css); }
  else if (el.isBlock) { childBlock = el.base; el.cls = claim(ctx, el.base, el.css, el.comp ? variantSlug(el.comp.variant) : ''); }
  else if (el.kind === 'mapped' && !Object.keys(el.css).length) el.cls = '';
  else el.cls = claim(ctx, block + '__' + el.base, el.css);
  if (el.runs) {
    el.runs.forEach(r => {
      if (!r.css) return;
      const lbl = Object.keys(r.css).length === 1 && r.css['font-weight'] ? 'strong' : r.css.color ? 'accent' : 'span';
      r.cls = claim(ctx, el.cls + '-' + lbl, r.css);
    });
  }
  el.children.forEach(c => namePass(c, childBlock, ctx, false));
}

/* ---------- pass 4 (React): extract repeated components ---------- */
function sig(el) { return el.tag + '.' + el.cls + '[' + el.children.map(sig).join(',') + ']'; }
function leaves(el, out) { if (el.kind === 'text' || el.kind === 'img' || el.kind === 'mapped') out.push(el); el.children.forEach(c => leaves(c, out)); return out; }
function extractComponents(root, ctx) {
  const groups = {};
  walk(root, e => { if (e !== root && e.isBlock && e.comp) { const k = e.comp.key + '|' + sig(e); (groups[k] = groups[k] || []).push(e); } });
  const defs = [];
  const usedNames = { [ctx.rootName]: 1 };
  const insideUsage = e => { let p = e.parent; while (p) { if (p.usage) return true; p = p.parent; } return false; };
  Object.keys(groups).sort((a, b) => groups[a][0].depth - groups[b][0].depth).forEach(k => {
    const list = groups[k].filter(e => !insideUsage(e));
    if (list.length < 2) return;
    const tpl = list[0];
    let name = pascal(tpl.cls.replace(/--/g, ' '));
    let n = name, i = 1; while (usedNames[n]) n = name + (++i); name = n; usedNames[name] = 1;
    const tl = leaves(tpl, []);
    const all = list.map(e => leaves(e, []));
    const props = []; const propNames = {};
    let unsafe = false;
    tl.forEach((leaf, idx) => {
      const vals = all.map(l => leaf.kind === 'text' ? l[idx].text : leaf.kind === 'mapped' ? JSON.stringify(l[idx].mapProps) : l[idx].asset.varName);
      if (vals.every(v => v === vals[0])) return;
      if (leaf.kind === 'mapped') { unsafe = true; return; }
      let pn = camel(leaf.kind === 'img' ? 'icon' : (leaf.base || 'text'));
      let p = pn, j = 1; while (propNames[p]) p = pn + (++j); propNames[p] = 1;
      props.push({ idx: idx, name: p, kind: leaf.kind });
    });
    if (unsafe) return;
    const def = { name: name, tpl: tpl, props: props };
    defs.push(def);
    list.forEach((e, ii) => {
      const l = all[ii];
      e.usage = { def: def, values: props.map(p => ({ name: p.name, kind: p.kind, value: p.kind === 'text' ? l[p.idx].text : l[p.idx].asset.varName, file: p.kind === 'img' ? l[p.idx].asset.file : '' })) };
    });
    // mark template leaves with prop refs
    props.forEach(p => { tl[p.idx].prop = p.name; });
  });
  return defs;
}

/* ---------- renderers ---------- */
const VOID = { img: 1 };
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;'); }
function ind(n) { return '  '.repeat(n); }

function htmlText(el) {
  const fmt = t => escHtml(t).replace(/\n/g, '<br />');
  if (!el.runs) return fmt(el.text);
  return el.runs.map(r => r.cls ? '<span class="' + r.cls + '">' + fmt(r.text) + '</span>' : fmt(r.text)).join('');
}
function renderHTML(el, d) {
  const attrs = ' class="' + el.cls + '"' + Object.keys(el.attrs).filter(k => k !== 'alt').map(k => ' ' + k + '="' + escAttr(el.attrs[k]) + '"').join('');
  if (el.kind === 'img') return ind(d) + '<img' + attrs + ' src="' + (el.asset.src || 'assets/' + el.asset.file) + '" alt="' + escAttr(el.attrs.alt) + '"' + (el.attrs.alt ? '' : ' aria-hidden="true"') + ' />';
  if (el.kind === 'text') return ind(d) + '<' + el.tag + attrs + '>' + htmlText(el) + '</' + el.tag + '>';
  if (!el.children.length) return ind(d) + '<' + el.tag + attrs + '></' + el.tag + '>';
  return ind(d) + '<' + el.tag + attrs + '>\n' + el.children.map(c => renderHTML(c, d + 1)).join('\n') + '\n' + ind(d) + '</' + el.tag + '>';
}

function jsxStr(s) { return /["{}<>\n\\]/.test(s) || /^\s|\s$/.test(s) ? '{' + JSON.stringify(s) + '}' : '"' + s + '"'; }
function jsxTextNode(t) {
  return t.split('\n').map(line => (/[{}<>]/.test(line) || /^\s|\s$/.test(line)) && line ? '{' + JSON.stringify(line) + '}' : line.replace(/&/g, '&amp;')).join('<br />');
}
function classAttr(el, mode, unit, base, css) {
  if (mode === 'tw') { const tw = cssToTailwind(css || el.css, unit, base).join(' '); return tw ? ' className="' + tw + '"' : ''; }
  return ' className="' + el.cls + '"';
}
function jsxText(el, mode, unit, base) {
  if (el.prop) return '{' + el.prop + '}';
  if (!el.runs) return jsxTextNode(el.text);
  return el.runs.map(r => r.css ? '<span' + (mode === 'tw' ? classAttr(r, mode, unit, base, r.css) : ' className="' + r.cls + '"') + '>' + jsxTextNode(r.text) + '</span>' : jsxTextNode(r.text)).join('');
}
function renderJSX(el, d, mode, unit, base, inDef) {
  if (el.usage && !inDef) {
    const props = el.usage.values.map(v => ' ' + v.name + '=' + (v.kind === 'img' ? '{' + v.value + '}' : jsxStr(v.value))).join('');
    return ind(d) + '<' + el.usage.def.name + props + ' />';
  }
  if (el.kind === 'mapped') {
    const cls = Object.keys(el.css).length ? classAttr(el, mode, unit, base) : '';
    const a = cls + el.mapProps.attrs.map(x => x.kind === 'bool' ? ' ' + x.name : ' ' + x.name + '=' + jsxStr(x.value)).join('');
    return el.mapProps.children !== null ? ind(d) + '<' + el.map.name + a + '>' + jsxTextNode(el.mapProps.children) + '</' + el.map.name + '>' : ind(d) + '<' + el.map.name + a + ' />';
  }
  const attrs = classAttr(el, mode, unit, base) + Object.keys(el.attrs).filter(k => k !== 'alt').map(k => ' ' + k + '="' + escAttr(el.attrs[k]) + '"').join('');
  if (el.kind === 'img') return ind(d) + '<img' + attrs + ' src={' + (el.prop || el.asset.varName) + '} alt="' + escAttr(el.attrs.alt) + '"' + (el.attrs.alt ? '' : ' aria-hidden="true"') + ' />';
  if (el.kind === 'text') return ind(d) + '<' + el.tag + attrs + '>' + jsxText(el, mode, unit, base) + '</' + el.tag + '>';
  if (!el.children.length) return ind(d) + '<' + el.tag + attrs + ' />';
  return ind(d) + '<' + el.tag + attrs + '>\n' + el.children.map(c => renderJSX(c, d + 1, mode, unit, base, inDef)).join('\n') + '\n' + ind(d) + '</' + el.tag + '>';
}
function cssBlock(sel, css, unit, base) {
  const body = Object.keys(css).map(k => '  ' + k + ': ' + remify(css[k], unit, base) + ';').join('\n');
  return body ? sel + ' {\n' + body + '\n}' : '';
}
function varsBlock(ctx, unit, base) {
  const names = Object.keys(ctx.vars);
  if (!names.length) return '';
  let out = ':root {\n' + names.map(n => '  ' + n + ': ' + remify(ctx.vars[n], unit, base) + ';').join('\n') + '\n}';
  Object.keys(ctx.themes || {}).forEach(sel => {
    const t = ctx.themes[sel];
    out += '\n\n' + sel + ' {\n' + Object.keys(t).map(n => '  ' + n + ': ' + remify(t[n], unit, base) + ';').join('\n') + '\n}';
  });
  return out;
}
function resetBlock(rootCls) {
  return '/* Scoped reset — Figma has no default margins */\n' +
    '.' + rootCls + ', .' + rootCls + ' *, .' + rootCls + ' *::before, .' + rootCls + ' *::after { box-sizing: border-box; }\n' +
    '.' + rootCls + ' :where(h1, h2, h3, p, ul, li, figure) { margin: 0; padding: 0; }\n' +
    '.' + rootCls + ' :where(button) { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }\n' +
    '.' + rootCls + ' :where(a) { color: inherit; text-decoration: none; }\n' +
    '.' + rootCls + ' :where(img) { display: block; }';
}
function stylesheet(ctx, rootCls, unit, base, pre) {
  const parts = [];
  if (pre) parts.push(pre);
  const v = varsBlock(ctx, unit, base); if (v) parts.push('/* Design tokens */\n' + v);
  parts.push(resetBlock(rootCls));
  const rules = ctx.order.map(r => cssBlock('.' + r.cls, r.css, unit, base)).filter(Boolean);
  parts.push(rules.join('\n\n'));
  return parts.join('\n\n') + '\n';
}

/* ------------------------------------------------------------------ */
/* Fonts: Google Fonts → <link>; other fonts → @font-face that uses     */
/* the installed copy, or the file the user uploaded (embedded/bundled) */
/* ------------------------------------------------------------------ */
const POPULAR_GOOGLE = ('inter,roboto,open sans,lato,montserrat,poppins,source sans 3,raleway,nunito,nunito sans,ubuntu,rubik,work sans,noto sans,dm sans,manrope,space grotesk,' +
  'plus jakarta sans,outfit,sora,urbanist,figtree,lexend,mulish,karla,barlow,ibm plex sans,ibm plex mono,ibm plex serif,jetbrains mono,fira sans,fira code,oswald,playfair display,' +
  'merriweather,lora,pt sans,pt serif,roboto mono,roboto slab,roboto condensed,archivo,be vietnam pro,red hat display,red hat text,josefin sans,quicksand,cabin,libre baskerville,' +
  'crimson text,eb garamond,cormorant garamond,bebas neue,anton,dm serif display,space mono,inconsolata,source code pro,noto serif,heebo,hind,kanit,prompt,mukta,titillium web,' +
  'exo 2,oxygen,assistant,onest,geist,geist mono,instrument sans,instrument serif,bricolage grotesque,schibsted grotesk,albert sans,epilogue,syne,unbounded,chivo,public sans,' +
  'overpass,asap,signika,varela round,zilla slab,spectral,alegreya,bitter,arvo,abril fatface,pacifico,dancing script,caveat,satisfy,lobster,comfortaa,righteous,orbitron,' +
  'rajdhani,teko,saira,chakra petch,tektur,audiowide,hanken grotesk,golos text,mona sans,hubot sans,league spartan,archivo black,inter tight,noto sans display').split(',');
const SYSTEM_FONTS = {
  sans: /^(sf pro( (text|display|rounded))?|sf compact( (text|display|rounded))?|system-ui|-apple-system|blinkmacsystemfont|helvetica( neue)?|arial|segoe ui|tahoma|verdana|trebuchet ms)$/i,
  serif: /^(new york( (small|medium|large|extra large))?|times( new roman)?|georgia)$/i,
  mono: /^(sf mono|menlo|monaco|courier( new)?|consolas)$/i
};
const STACK = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
};
function fontKind(fam) {
  const f = fam.toLowerCase();
  if (/mono|code|courier|menlo|consolas/.test(f)) return 'mono';
  if (!/sans/.test(f) && /serif|times|georgia|garamond|playfair|merriweather|lora|baskerville|caslon|bodoni|new york|didot|spectral|crimson|cormorant|bitter|arvo/.test(f)) return 'serif';
  return 'sans';
}
function systemKind(fam) { for (const k of Object.keys(SYSTEM_FONTS)) if (SYSTEM_FONTS[k].test(fam.trim())) return k; return null; }
const STYLE_WEIGHTS = [['extralight', 200], ['ultralight', 200], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['thin', 100], ['hairline', 100],
  ['light', 300], ['regular', 400], ['book', 400], ['normal', 400], ['medium', 500], ['bold', 700], ['heavy', 800], ['black', 900]];
function styleWeight(style) {
  const s = String(style || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const m = /([1-9]00)/.exec(s); if (m) return +m[1];
  for (const p of STYLE_WEIGHTS) if (s.indexOf(p[0]) > -1) return p[1];
  return 400;
}
function collectFonts(node, ctx) {
  const add = (fn, w) => {
    if (!fn || isMixed(fn) || !fn.family) return;
    const it = /italic|oblique/i.test(fn.style) ? 1 : 0;
    const weight = typeof w === 'number' ? w : styleWeight(fn.style);
    (ctx.fonts[fn.family] = ctx.fonts[fn.family] || {})[it + ',' + weight] = fn.style;
  };
  try { const segs = node.getStyledTextSegments(['fontName', 'fontWeight']); if (segs && segs.length) { segs.forEach(s => add(s.fontName, s.fontWeight)); return; } } catch (e) { /* ignore */ }
  try { add(node.fontName, isMixed(node.fontWeight) ? undefined : node.fontWeight); } catch (e) { /* ignore */ }
}
function timed(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
const sortKeys = keys => keys.slice().sort((a, b) => { const x = a.split(',').map(Number), y = b.split(',').map(Number); return x[0] - y[0] || x[1] - y[1]; });
const gMem = {};
/** Is `fam` on Google Fonts, and which of the used weights/styles exist there? Cached per user. */
async function googleCheck(fam, keys) {
  const ck = fam + '|' + sortKeys(keys).join(';');
  if (gMem[ck]) return gMem[ck];
  let store = {};
  try { store = (await figma.clientStorage.getAsync('gfonts-v1')) || {}; } catch (e) { /* ignore */ }
  if (store[ck]) return (gMem[ck] = store[ck]);
  const base = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fam).replace(/%20/g, '+');
  let res;
  try {
    if (typeof fetch !== 'function') throw new Error('no fetch');
    const probe = await timed(fetch(base), 2500);
    if (probe.status !== 200) res = { google: false, ok: [] };
    else {
      const oks = await Promise.all(keys.map(k => timed(fetch(base + ':ital,wght@' + k), 2500).then(r => r.status === 200 ? k : null).catch(() => null)));
      res = { google: true, ok: sortKeys(oks.filter(Boolean)) };
      if (!res.ok.length) res.ok = ['0,400'];
    }
    store[ck] = res;
    try { await figma.clientStorage.setAsync('gfonts-v1', store); } catch (e) { /* ignore */ }
  } catch (e) {
    const known = POPULAR_GOOGLE.indexOf(fam.toLowerCase()) > -1; // offline fallback
    res = { google: known, ok: known ? sortKeys(keys) : [], offline: true };
  }
  return (gMem[ck] = res);
}
function googleHref(list) {
  return 'https://fonts.googleapis.com/css2?' + list.map(g => {
    const ital = g.keys.some(k => k[0] === '1');
    return 'family=' + encodeURIComponent(g.family).replace(/%20/g, '+') + ':' + (ital ? 'ital,wght@' + g.keys.join(';') : 'wght@' + g.keys.map(k => k.split(',')[1]).join(';'));
  }).join('&') + '&display=swap';
}
const FONT_FMT = { woff2: ['font/woff2', 'woff2'], woff: ['font/woff', 'woff'], ttf: ['font/ttf', 'truetype'], otf: ['font/otf', 'opentype'] };
async function loadFontUploads(families) {
  const out = {};
  try {
    const keys = (await figma.clientStorage.keysAsync()).filter(k => k.indexOf('font:') === 0 && families.indexOf(k.slice(5).split('|')[0]) > -1);
    for (const k of keys) { const v = await figma.clientStorage.getAsync(k); if (v && v.bytes) out[k.slice(5)] = v; }
  } catch (e) { /* ignore */ }
  return out;
}
/** Decide how each font family is delivered. */
async function planFonts(ctx, lang, wantBytes, fast) {
  const plan = { google: [], faces: [], files: [], families: [] };
  const fams = Object.keys(ctx.fonts);
  if (!fams.length) return plan;
  const uploads = await loadFontUploads(fams);
  // look up all families in parallel (Dev Mode codegen has a 3 s budget: cap at ~1.2 s, lookups keep running and are cached)
  const checks = await Promise.all(fams.map(fam => {
    if (systemKind(fam)) return null;
    const keys = sortKeys(Object.keys(ctx.fonts[fam]));
    const fb = () => { const known = POPULAR_GOOGLE.indexOf(fam.toLowerCase()) > -1; return { google: known, ok: known ? keys : [], offline: true }; };
    return (fast ? timed(googleCheck(fam, keys), 1200) : googleCheck(fam, keys)).catch(fb);
  }));
  for (const [fi, fam] of fams.entries()) {
    const keys = sortKeys(Object.keys(ctx.fonts[fam]));
    const info = { family: fam, kind: fontKind(fam), variants: [] };
    const sys = systemKind(fam);
    let g = { google: false, ok: [] };
    if (sys) { info.source = 'system'; info.kind = sys; }
    else {
      g = checks[fi]; info.source = g.google ? 'google' : 'custom'; if (g.offline) info.offline = true; }
    if (info.source === 'google') plan.google.push({ family: fam, keys: g.ok });
    keys.forEach(k => {
      const it = k[0] === '1', w = +k.split(',')[1], style = ctx.fonts[fam][k];
      const up = uploads[fam + '|' + k];
      const v = { key: k, weight: w, italic: it, style: style, uploaded: !!up, onGoogle: g.ok.indexOf(k) > -1 };
      info.variants.push(v);
      if (info.source !== 'custom') return;
      const src = ['local("' + fam + ' ' + style + '")', 'local("' + fam.replace(/\s+/g, '') + '-' + String(style).replace(/\s+/g, '') + '")'];
      if (up) {
        const f = FONT_FMT[up.ext] || FONT_FMT.woff2;
        const file = 'fonts/' + slug(fam) + '-' + w + (it ? '-italic' : '') + '.' + up.ext;
        if (lang === 'html-single') src.push('url(data:' + f[0] + ';base64,' + figma.base64Encode(up.bytes) + ') format("' + f[1] + '")');
        else { src.push('url("' + (/^react/.test(lang) ? './' : '') + file + '") format("' + f[1] + '")'); if (wantBytes) plan.files.push({ name: file, bytes: up.bytes }); }
      }
      plan.faces.push('@font-face {\n  font-family: "' + fam + '";\n  src: ' + src.join(',\n       ') + ';\n  font-weight: ' + w + ';\n  font-style: ' + (it ? 'italic' : 'normal') + ';\n  font-display: swap;\n}');
    });
    plan.families.push(info);
  }
  return plan;
}
function fontStack(value, plan) {
  if (!value || /var\(/.test(value)) return value;
  const first = value.split(',')[0].replace(/["']/g, '').trim();
  if (!first) return value;
  const info = plan.families.find(f => f.family.toLowerCase() === first.toLowerCase());
  const kind = info ? info.kind : (systemKind(first) || fontKind(first));
  return (/\s/.test(first) ? '"' + first + '"' : first) + ', ' + STACK[kind];
}
function applyFontStacks(root, ctx, plan) {
  walk(root, e => {
    if (e.css['font-family']) e.css['font-family'] = fontStack(e.css['font-family'], plan);
    (e.runs || []).forEach(r => { if (r.css && r.css['font-family']) r.css['font-family'] = fontStack(r.css['font-family'], plan); });
  });
  Object.keys(ctx.vars).forEach(k => { if (/font(?!-?(size|weight|height|spacing))/i.test(k) && !/^[\d.]/.test(ctx.vars[k])) ctx.vars[k] = fontStack(ctx.vars[k], plan); });
}
/** CSS for fonts. `withImport` = Google Fonts via a CSS at-rule (for .css files); HTML uses a <link> tag instead. */
function fontCss(plan, withImport) {
  const parts = [];
  if (withImport && plan.google.length) parts.push("@import url('" + googleHref(plan.google) + "');");
  const custom = plan.families.filter(f => f.source === 'custom');
  if (custom.length) {
    const missing = custom.filter(f => f.variants.some(v => !v.uploaded)).map(f => f.family);
    parts.push('/* Not on Google Fonts: ' + custom.map(f => f.family).join(', ') + (missing.length ? '\n   Variants without a file use the copy installed on the device (local()).\n   Add the font files in DevReady → Code → Fonts to bundle them. */' : ' — font files bundled */') + '\n' + plan.faces.join('\n'));
  }
  return parts.join('\n\n');
}
function fontHead(plan) {
  if (!plan.google.length) return '';
  return '  <link rel="preconnect" href="https://fonts.googleapis.com" />\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n  <link href="' + googleHref(plan.google).replace(/&/g, '&amp;') + '" rel="stylesheet" />\n';
}

/* ---------- single-file HTML: embed assets & image fills as data URIs ---------- */
const DATA_MIME = { SVG: 'image/svg+xml', PNG: 'image/png', JPG: 'image/jpeg' };
async function inlineAssets(root, ctx, budget) {
  let used = 0;
  // 1) exported assets (icons, images, layers with export settings)
  for (const a of ctx.assets) {
    try {
      const n = await figma.getNodeByIdAsync(a.id);
      const fmt = a.format === 'SVG' ? 'SVG' : a.format === 'JPG' ? 'JPG' : 'PNG';
      const o = { format: fmt };
      if (fmt === 'SVG') o.svgOutlineText = true; else o.constraint = { type: 'SCALE', value: a.scale || 2 };
      const bytes = await n.exportAsync(o);
      if (used + bytes.length > budget) continue;
      used += bytes.length;
      a.src = 'data:' + DATA_MIME[fmt] + ';base64,' + figma.base64Encode(bytes);
    } catch (e) { /* leave as file reference */ }
  }
  // 2) image fills on containers (Figma's CSS says url(<path-to-image>))
  const els = [];
  walk(root, e => { const b = e.css.background || e.css['background-image'] || ''; if (/url\(<path-to-image>\)/.test(b)) els.push(e); });
  for (const e of els) {
    try {
      const n = await figma.getNodeByIdAsync(e.id);
      const paint = n.fills.find(f => f.type === 'IMAGE' && f.visible !== false && f.imageHash);
      const img = paint && figma.getImageByHash(paint.imageHash);
      if (!img) continue;
      const bytes = await img.getBytesAsync();
      if (used + bytes.length > budget) continue;
      used += bytes.length;
      const mime = bytes[0] === 0xFF ? 'image/jpeg' : bytes[0] === 0x47 ? 'image/gif' : 'image/png';
      const uri = 'url(data:' + mime + ';base64,' + figma.base64Encode(bytes) + ')';
      ['background', 'background-image'].forEach(k => { if (e.css[k]) e.css[k] = e.css[k].replace(/url\(<path-to-image>\)/g, uri); });
      if (e.css.background && !/\b(cover|contain)\b/.test(e.css.background)) e.css['background-size'] = paint.scaleMode === 'FIT' ? 'contain' : 'cover';
    } catch (e2) { /* ignore */ }
  }
  return used;
}
function singleHtml(node, root, ctx, unit, base, note) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>' + escHtml(node.name) + '</title>\n' +
    fontHead(ctx.fontPlan) +
    '  <!' + '-- Single-file build from Figma (DevReady) · open it directly in any browser. CSS and assets are embedded. --' + '>\n' +
    '  <style>\n/* Page preview canvas */\nbody { margin: 0; min-height: 100vh; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; box-sizing: border-box; background: #F5F5F5; }\n\n' +
    stylesheet(ctx, root.cls, unit, base, fontCss(ctx.fontPlan, false)) + '  </style>\n</head>\n<body>\n' +
    (note ? '  <!' + '-- ' + note + ' --' + '>\n' : '') + renderHTML(root, 1) + '\n</body>\n</html>\n';
}

/**
 * Generate code for a node.
 * lang: 'html-css' | 'react-tailwind' | 'react-css'
 * returns { files: [{name, lang, code}], assets: [{id,file,format,scale}], truncated, stats }
 */
async function generateCode(node, lang, unit, base, maxNodes, opts) {
  opts = opts || {};
  const ctx = { count: 0, max: maxNodes || 600, truncated: false, maxFont: 0, assets: [], assetByKey: {}, assetNames: {}, vars: {}, classes: {}, order: [], weights: {}, usedTitle: false, rootWidth: node.width,
    varIds: {}, themes: {}, tokenInfo: {}, imports: {}, fonts: {}, react: /^react/.test(lang), mappings: /^react/.test(lang) ? loadMappings() : {} };
  const root = await buildRaw(node, ctx, true);
  if (!root) return { files: [{ name: 'empty.txt', lang: 'text', code: 'Nothing visible to generate.' }], assets: [] };
  structurePass(root, null, ctx, null);
  walk(root, e => { if (e.css['font-weight']) ctx.weights[e.css['font-weight']] = 1; (e.runs || []).forEach(r => { if (r.css && r.css['font-weight']) ctx.weights[r.css['font-weight']] = 1; }); });
  hoistFont(root);
  collectVars(root, ctx);
  try { await resolveThemes(ctx); } catch (e) { /* variables API unavailable */ }
  let fontPlan = { google: [], faces: [], files: [], families: [] };
  try { fontPlan = await planFonts(ctx, lang, !!opts.withFonts, !!opts.fastFonts); } catch (e) { /* ignore */ }
  applyFontStacks(root, ctx, fontPlan);
  ctx.fontPlan = fontPlan;
  ctx.rootFont = root.css['font-family'] || '';
  let inlined = 0;
  if (lang === 'html-single') { try { inlined = await inlineAssets(root, ctx, opts.inlineBudget || 8e6); } catch (e) { /* ignore */ } }
  const rootName = cleanName(node.name) || 'component';
  if (root.tag === 'div' && node.width >= 900) root.tag = 'main';
  namePass(root, rootName, ctx, true);

  const Comp = pascal(rootName);
  ctx.rootName = Comp;
  const note = ctx.truncated ? 'Output truncated after ' + ctx.max + ' layers — select a smaller frame for full code.' : '';
  const files = [];

  if (lang === 'swiftui' || lang === 'compose') {
    const defs = extractComponents(root, ctx);
    if (lang === 'swiftui') files.push({ name: Comp + '.swift', lang: 'swift', code: (note ? '// ' + note + '\n' : '') + generateSwift(root, defs, ctx, Comp) });
    else files.push({ name: Comp + '.kt', lang: 'kotlin', code: (note ? '// ' + note + '\n' : '') + generateCompose(root, defs, ctx, Comp) });
  } else if (lang === 'html-single') {
    files.push({ name: rootName + '.html', lang: 'html', code: singleHtml(node, root, ctx, unit, base, note) });
  } else if (lang === 'html-css') {
    const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>' + escHtml(node.name) + '</title>\n' +
      fontHead(ctx.fontPlan) + '  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n' +
      (note ? '  <!' + '-- ' + note + ' --' + '>\n' : '') + renderHTML(root, 1) + '\n</body>\n</html>\n';
    files.push({ name: 'index.html', lang: 'html', code: html });
    files.push({ name: 'styles.css', lang: 'css', code: stylesheet(ctx, root.cls, unit, base, fontCss(ctx.fontPlan, false)) });
  } else {
    const mode = lang === 'react-tailwind' ? 'tw' : 'css';
    const defs = extractComponents(root, ctx);
    const imports = Object.keys(ctx.imports).map(p => "import { " + Object.keys(ctx.imports[p]).join(', ') + " } from '" + p + "';")
      .concat(ctx.assets.map(a => "import " + a.varName + " from './assets/" + a.file + "';"));
    if (mode === 'css') imports.push("import './" + Comp + ".css';");
    else if (Object.keys(ctx.vars).length || fontCss(ctx.fontPlan, true)) imports.push("import './tokens.css';");
    const defCode = defs.map(def => {
      const args = def.props.length ? '{ ' + def.props.map(p => p.name).join(', ') + ' }' : '';
      return 'function ' + def.name + '(' + args + ') {\n  return (\n' + renderJSX(def.tpl, 2, mode, unit, base, true) + '\n  );\n}';
    });
    const main = 'export default function ' + Comp + '() {\n  return (\n' + renderJSX(root, 2, mode, unit, base, false) + '\n  );\n}';
    const code = (imports.length ? imports.join('\n') + '\n\n' : '') + (note ? '// ' + note + '\n\n' : '') + defCode.concat([main]).join('\n\n') + '\n';
    files.push({ name: Comp + '.jsx', lang: 'jsx', code: code });
    const fcss = fontCss(ctx.fontPlan, true);
    if (mode === 'css') files.push({ name: Comp + '.css', lang: 'css', code: stylesheet(ctx, root.cls, unit, base, fcss) });
    else if (Object.keys(ctx.vars).length || fcss) files.push({ name: 'tokens.css', lang: 'css', code: (fcss ? fcss + '\n\n' : '') + (Object.keys(ctx.vars).length ? '/* Design tokens from Figma variables */\n' + varsBlock(ctx, unit, base) + '\n' : '') });
  }
  return {
    files: files,
    assets: ctx.assets.filter(a => !a.src).map(a => ({ id: a.id, file: a.file, format: a.format, scale: a.scale })),
    fonts: fontPlan.families,
    fontFiles: opts.withFonts ? fontPlan.files : undefined,
    preview: { w: round(node.width), h: round(node.height), inlinedKB: Math.round(inlined / 1024) },
    truncated: ctx.truncated,
    stats: { layers: ctx.count, classes: ctx.order.length, assets: ctx.assets.length, tokens: Object.keys(ctx.vars).length, modes: Object.keys(ctx.themes).length, mapped: Object.keys(ctx.imports).reduce((n, p) => n + Object.keys(ctx.imports[p]).length, 0) }
  };
}

/* ------------------------------------------------------------------ */
/* PRO: variable modes, change tracking, Code Connect, native tools    */
/* ------------------------------------------------------------------ */

/* ---------- variable modes ---------- */
const collCache = {};
async function getColl(id) {
  if (collCache[id] !== undefined) return collCache[id];
  let c = null;
  try { c = await figma.variables.getVariableCollectionByIdAsync(id); } catch (e) { /* remote */ }
  collCache[id] = c;
  return c;
}
async function resolveVarValue(val, modeId, depth) {
  if (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth > 6) return { value: null };
    let v = null;
    try { v = await figma.variables.getVariableByIdAsync(val.id); } catch (e) { /* ignore */ }
    if (!v) return { value: null };
    let mv = v.valuesByMode[modeId];
    if (mv === undefined) { const c = await getColl(v.variableCollectionId); mv = c ? v.valuesByMode[c.defaultModeId] : v.valuesByMode[Object.keys(v.valuesByMode)[0]]; }
    const inner = await resolveVarValue(mv, modeId, depth + 1);
    return { value: inner.value, alias: inner.alias || v.name };
  }
  return { value: val };
}
function varValueCss(value, type, unitHint) {
  if (value === null || value === undefined) return null;
  if (type === 'COLOR' && typeof value === 'object' && 'r' in value) {
    const a = value.a === undefined ? 1 : value.a;
    return a < 1 ? 'rgba(' + to255(value.r) + ', ' + to255(value.g) + ', ' + to255(value.b) + ', ' + round(a, 2) + ')' : colorHex(value);
  }
  if (type === 'FLOAT') return round(value, 2) + (unitHint || '');
  if (type === 'STRING') return String(value);
  if (type === 'BOOLEAN') return value ? 'true' : 'false';
  return String(value);
}
/** Full variable info incl. resolved value for every mode of its collection. */
async function varModes(id) {
  const base = await varInfo(id);
  if (!base) return null;
  if (base.modes) return base;
  base.id = id;
  try {
    const v = await figma.variables.getVariableByIdAsync(id);
    const c = await getColl(v.variableCollectionId);
    base.cssName = base.web && /var\((--[^),\s]+)/.test(base.web) ? /var\((--[^),\s]+)/.exec(base.web)[1] : '--' + v.name.replace(/\//g, '-').replace(/\s+/g, '-');
    base.modes = [];
    if (c) {
      base.defaultModeId = c.defaultModeId;
      for (const m of c.modes) {
        const r = await resolveVarValue(v.valuesByMode[m.modeId], m.modeId, 0);
        base.modes.push({
          id: m.modeId, name: m.name, isDefault: m.modeId === c.defaultModeId,
          value: r.value, alias: r.alias || '',
          color: v.resolvedType === 'COLOR' && r.value && typeof r.value === 'object' ? rgbaObj(r.value, r.value.a) : null,
          display: varValueCss(r.value, v.resolvedType, '')
        });
      }
    }
  } catch (e) { base.modes = []; }
  return base;
}
function collectVarIds(node, ctx) {
  const add = a => { if (a && a.id) ctx.varIds[a.id] = 1; };
  try {
    const bv = node.boundVariables || {};
    Object.keys(bv).forEach(k => { const v = bv[k]; if (Array.isArray(v)) v.forEach(add); else add(v); });
  } catch (e) { /* ignore */ }
  ['fills', 'strokes'].forEach(k => {
    try { if (k in node && !isMixed(node[k])) node[k].forEach(p => { if (p.boundVariables && p.boundVariables.color) add(p.boundVariables.color); }); } catch (e) { /* ignore */ }
  });
  try { if ('effects' in node) node.effects.forEach(e => { if (e.boundVariables) Object.keys(e.boundVariables).forEach(k => add(e.boundVariables[k])); }); } catch (e) { /* ignore */ }
}
const normVar = s => String(s).replace(/^--/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function themeSelector(collName, modeName, allModes) {
  if (allModes.some(m => /light|dark/i.test(m.name))) return '[data-theme="' + slug(modeName) + '"]';
  return '[data-' + slug(collName) + '="' + slug(modeName) + '"]';
}
/** Match CSS var names in ctx.vars to Figma variables and build per-mode theme blocks. */
async function resolveThemes(ctx) {
  ctx.themes = {};      // selector → { --var: value }
  ctx.tokenInfo = {};   // --var → { type, modes: { modeName: {r,g,b,a}|value }, defaultValue }
  const byNorm = {};
  Object.keys(ctx.vars).forEach(k => { byNorm[normVar(k)] = k; });
  for (const id of Object.keys(ctx.varIds)) {
    const info = await varModes(id);
    if (!info || !info.modes || !info.modes.length) continue;
    const cssVar = byNorm[normVar(info.cssName)] || byNorm[normVar(info.name)];
    if (!cssVar) continue;
    const hint = /px$/.test(ctx.vars[cssVar]) ? 'px' : '';
    const ti = { type: info.type, modes: {}, collection: info.collection };
    info.modes.forEach(m => {
      const css = varValueCss(m.value, info.type, hint);
      if (css === null) return;
      ti.modes[m.name] = m.color || m.value;
      if (m.isDefault) { ctx.vars[cssVar] = css; ti.defaultValue = m.color || m.value; }
      else {
        const sel = themeSelector(info.collection, m.name, info.modes);
        (ctx.themes[sel] = ctx.themes[sel] || {})[cssVar] = css;
      }
    });
    ctx.tokenInfo[cssVar] = ti;
  }
}

/* ---------- change tracking ("changed since ready") ---------- */
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function safeVal(v) { return isMixed(v) ? 'mixed' : v; }
function nodeSig(n) {
  const g = [round(n.x, 1), round(n.y, 1), round(n.width, 1), round(n.height, 1), n.rotation ? round(n.rotation, 1) : 0].join(',');
  let st = '';
  try {
    st = JSON.stringify([
      'fills' in n ? safeVal(n.fills) : 0, 'strokes' in n ? n.strokes : 0, 'strokeWeight' in n ? safeVal(n.strokeWeight) : 0,
      'effects' in n ? n.effects : 0, 'cornerRadius' in n ? safeVal(n.cornerRadius) : 0, 'opacity' in n ? n.opacity : 1, n.visible,
      'layoutMode' in n ? [n.layoutMode, n.itemSpacing, n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft, n.primaryAxisAlignItems, n.counterAxisAlignItems, n.layoutWrap] : 0
    ]);
  } catch (e) { /* ignore */ }
  let tx = '';
  if (n.type === 'TEXT') {
    try { tx = n.characters + '|' + JSON.stringify([n.fontSize, n.fontName, n.lineHeight, n.letterSpacing, n.textAlignHorizontal].map(safeVal)); } catch (e) { /* ignore */ }
  }
  return [hashStr(g), hashStr(st), tx ? hashStr(tx) : ''];
}
const SNAP_LIMIT = 2500;
/* Figma caps each plugin-data entry at 100 kB (enforced since March 2025), so large
   values are split across "<key>:0..n" entries. 30k UTF-16 units is < 90 kB even
   when every unit needs 3 bytes of UTF-8. */
const CHUNK_UNITS = 30000;
function writeChunked(node, key, str) {
  const old = +node.getSharedPluginData(NS, key + ':n') || 0;
  const n = str ? Math.ceil(str.length / CHUNK_UNITS) : 0;
  for (let i = 0; i < n; i++) node.setSharedPluginData(NS, key + ':' + i, str.slice(i * CHUNK_UNITS, (i + 1) * CHUNK_UNITS));
  for (let i = n; i < old; i++) node.setSharedPluginData(NS, key + ':' + i, '');
  node.setSharedPluginData(NS, key + ':n', n ? String(n) : '');
  if (node.getSharedPluginData(NS, key)) node.setSharedPluginData(NS, key, ''); // legacy single entry
}
function readChunked(node, key) {
  const n = +node.getSharedPluginData(NS, key + ':n') || 0;
  if (!n) return node.getSharedPluginData(NS, key); // written by an older version
  let out = '';
  for (let i = 0; i < n; i++) out += node.getSharedPluginData(NS, key + ':' + i);
  return out;
}
function snapshot(root, limit) {
  const map = {}; let count = 0;
  (function walk(n) {
    if (count >= limit) { map.__partial = 1; return; }
    count++;
    const s = nodeSig(n);
    map[n.id] = [String(n.name).slice(0, 40), s[0], s[1], s[2]];
    if ('children' in n) n.children.forEach(walk);
  })(root);
  return map;
}
function saveBaseline(target) {
  const snap = snapshot(target, SNAP_LIMIT);
  writeChunked(target, 'baseline', JSON.stringify(snap));
  target.setSharedPluginData(NS, 'baselineAt', new Date().toISOString());
  diffCache[target.id] = null;
}
const diffCache = {};
function diffBaseline(target) {
  if (diffCache[target.id]) return diffCache[target.id];
  const raw = readChunked(target, 'baseline');
  if (!raw) return null;
  let base;
  try { base = JSON.parse(raw); } catch (e) { return null; }
  const now = snapshot(target, SNAP_LIMIT);
  const partial = !!(base.__partial || now.__partial);
  delete base.__partial; delete now.__partial;
  const changes = [];
  Object.keys(now).forEach(id => {
    const a = base[id], b = now[id];
    if (!a) { changes.push({ id: id, name: b[0], kind: 'added', parts: [] }); return; }
    const parts = [];
    if (a[1] !== b[1]) parts.push('size/position');
    if (a[2] !== b[2]) parts.push('style');
    if (a[3] !== b[3]) parts.push('text');
    if (a[0] !== b[0]) parts.push('renamed');
    if (parts.length) changes.push({ id: id, name: b[0], kind: 'changed', parts: parts });
  });
  // When a snapshot hit the layer cap, layers past it are unknown, not added/removed.
  if (partial) {
    for (let i = changes.length - 1; i >= 0; i--) { if (changes[i].kind !== 'changed') changes.splice(i, 1); }
  } else {
    Object.keys(base).forEach(id => { if (!now[id]) changes.push({ id: null, name: base[id][0], kind: 'removed', parts: [] }); });
  }
  const res = { at: target.getSharedPluginData(NS, 'baselineAt'), partial: partial, limit: SNAP_LIMIT, count: changes.length, changes: changes.slice(0, 150), containerId: target.id, containerName: target.name };
  diffCache[target.id] = res;
  return res;
}

/* ---------- Code Connect-style component mapping ---------- */
function loadMappings() {
  const out = {};
  try {
    figma.root.getSharedPluginDataKeys(NS).filter(k => k.indexOf('map:') === 0).forEach(k => {
      try { out[k.slice(4)] = JSON.parse(figma.root.getSharedPluginData(NS, k)); } catch (e) { /* ignore */ }
    });
  } catch (e) { /* ignore */ }
  return out;
}
const CHILD_PROP = /^(label|text|title|content|children|value|caption)$/i;
function mapProps(props) {
  const attrs = []; let children = null;
  (props || []).forEach(p => {
    const name = camel(p.name);
    if (p.type === 'VARIANT') { if (!/^(default)$/i.test(String(p.value))) attrs.push({ name: name, kind: 'str', value: camel(String(p.value)) }); }
    else if (p.type === 'BOOLEAN') { if (p.value === true || p.value === 'true') attrs.push({ name: name, kind: 'bool' }); }
    else if (p.type === 'TEXT') { if (CHILD_PROP.test(p.name.trim()) && children === null) children = String(p.value); else attrs.push({ name: name, kind: 'str', value: String(p.value) }); }
  });
  return { attrs: attrs, children: children };
}
function connectSnippet(map, props) {
  const mp = mapProps(props);
  const attrs = mp.attrs.map(a => a.kind === 'bool' ? ' ' + a.name : ' ' + a.name + '=' + jsxStr(a.value)).join('');
  const open = '<' + map.name + attrs;
  const body = mp.children !== null ? open + '>\n  ' + jsxTextNode(mp.children) + '\n</' + map.name + '>' : open + ' />';
  return "import { " + map.name + " } from '" + map.path + "';\n\n" + body;
}

/* ---------- layers (breadcrumb + children) ---------- */
function layersInfo(node) {
  const anc = [];
  let p = node.parent;
  while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') { anc.unshift({ id: p.id, name: p.name, type: p.type }); p = p.parent; }
  const kids = 'children' in node ? node.children.slice(0, 80).map(c => ({ id: c.id, name: c.name, type: c.type, visible: c.visible !== false, kids: 'children' in c ? c.children.length : 0 })) : [];
  return { ancestors: anc.slice(-6), children: kids, more: 'children' in node && node.children.length > 80 ? node.children.length - 80 : 0 };
}

/* ---------- native Dev Mode measurements ---------- */
const MEASURABLE = { COMPONENT: 1, COMPONENT_SET: 1, ELLIPSE: 1, FRAME: 1, INSTANCE: 1, LINE: 1, POLYGON: 1, RECTANGLE: 1, STAR: 1, TEXT: 1, VECTOR: 1 };
function addNativeMeasurements(sel) {
  const page = figma.currentPage;
  if (!('addMeasurement' in page)) throw new Error('Measurements API not available here');
  let pairs = [];
  if (sel.length === 2) {
    const a = sel[0], b = sel[1], A = a.absoluteBoundingBox, B = b.absoluteBoundingBox;
    const inside = (o, i) => i.x >= o.x && i.y >= o.y && i.x + i.width <= o.x + o.width && i.y + i.height <= o.y + o.height;
    if (inside(A, B) || inside(B, A)) {
      const o = inside(A, B) ? a : b, i = o === a ? b : a;
      pairs = [['TOP', 'TOP'], ['BOTTOM', 'BOTTOM'], ['LEFT', 'LEFT'], ['RIGHT', 'RIGHT']].map(s => [o, s[0], i, s[1]]);
    } else {
      if (B.x >= A.x + A.width) pairs.push([a, 'RIGHT', b, 'LEFT']); else if (A.x >= B.x + B.width) pairs.push([b, 'RIGHT', a, 'LEFT']);
      if (B.y >= A.y + A.height) pairs.push([a, 'BOTTOM', b, 'TOP']); else if (A.y >= B.y + B.height) pairs.push([b, 'BOTTOM', a, 'TOP']);
    }
  } else if (sel.length === 1 && sel[0].parent && sel[0].parent.type !== 'PAGE' && sel[0].parent.type !== 'SECTION') {
    const n = sel[0], p = n.parent;
    pairs = [['TOP', 'TOP'], ['BOTTOM', 'BOTTOM'], ['LEFT', 'LEFT'], ['RIGHT', 'RIGHT']].map(s => [p, s[0], n, s[1]]);
  }
  let added = 0;
  for (const pr of pairs) {
    if (!MEASURABLE[pr[0].type] || !MEASURABLE[pr[2].type]) continue;
    try { page.addMeasurement({ node: pr[0], side: pr[1] }, { node: pr[2], side: pr[3] }); added++; } catch (e) { /* zero distance or unsupported */ }
  }
  return added;
}
function clearNativeMeasurements(sel) {
  const page = figma.currentPage;
  if (!('getMeasurementsForNode' in page)) return 0;
  const ids = {};
  sel.forEach(n => { try { page.getMeasurementsForNode(n).forEach(m => { ids[m.id] = 1; }); } catch (e) { /* ignore */ } });
  Object.keys(ids).forEach(id => { try { page.deleteMeasurement(id); } catch (e) { /* ignore */ } });
  return Object.keys(ids).length;
}

/* ================================================================== */
/* Native code: SwiftUI + Jetpack Compose (derived from the same tree) */
/* ================================================================== */
function npx(v) { if (v === undefined || v === null) return null; const m = /^(-?\d*\.?\d+)px/.exec(String(v).trim()); return m ? parseFloat(m[1]) : (String(v).trim() === '0' ? 0 : null); }
function parseColorStr(v, ctx) {
  if (!v) return null;
  let s = String(v).trim(), token = null;
  const vm = /^var\((--[\w-]+)\)$/.exec(s);
  if (vm) { token = vm[1]; s = ctx.vars[vm[1]] || ''; }
  let c = null, m;
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
    let h = m[1]; if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    c = { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  } else if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    c = { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] === undefined ? 1 : p[3] };
  } else if (/^white$/i.test(s)) c = { r: 1, g: 1, b: 1, a: 1 };
  else if (/^black$/i.test(s)) c = { r: 0, g: 0, b: 0, a: 1 };
  if (!c) return null;
  c.token = token;
  return c;
}
function parsePad(css) {
  const p = css.padding ? css.padding.split(/\s+/).map(npx) : [0];
  let t = p[0], r = p.length > 1 ? p[1] : t, b = p.length > 2 ? p[2] : t, l = p.length > 3 ? p[3] : r;
  if (css['padding-top']) t = npx(css['padding-top']); if (css['padding-right']) r = npx(css['padding-right']);
  if (css['padding-bottom']) b = npx(css['padding-bottom']); if (css['padding-left']) l = npx(css['padding-left']);
  return [t || 0, r || 0, b || 0, l || 0];
}
function parseShadow(v, ctx) {
  if (!v) return null;
  const first = v.split(/,(?![^(]*\))/)[0].trim();
  if (/^inset/.test(first)) return null;
  const col = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}|var\([^)]*\))/i.exec(first);
  const nums = first.replace(col ? col[0] : '', '').trim().split(/\s+/).map(npx);
  return { x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color: col ? parseColorStr(col[0], ctx) : null };
}
function nprops(el, parent, ctx) {
  const c = {}, P = {};
  Object.keys(el.css).forEach(k => { c[k] = /color|background|border|shadow/.test(k) ? el.css[k] : String(el.css[k]).replace(/var\((--[\w-]+)\)/g, (m, n) => ctx.vars[n] || m); });
  P.dir = c.display && /flex/.test(c.display) ? (c['flex-direction'] === 'column' ? 'col' : 'row') : (el.children.some(k => k.css.position === 'absolute') ? 'z' : 'col');
  const gp = c.gap ? c.gap.split(/\s+/) : [];
  P.gap = gp.length ? npx(gp[gp.length - 1]) || 0 : 0;
  P.justify = c['justify-content'] || 'flex-start';
  P.align = c['align-items'] || 'flex-start';
  P.pad = parsePad(c);
  P.w = c.width && c.width !== '100%' ? npx(c.width) : null;
  P.h = c.height && c.height !== '100%' ? npx(c.height) : null;
  const pdir = parent ? (parent.css['flex-direction'] === 'column' ? 'col' : 'row') : null;
  P.grow = /^1(\s|$)/.test(c.flex || '') || c['flex-grow'] === '1';
  P.fillW = c.width === '100%' || (c['align-self'] === 'stretch' && pdir === 'col') || (P.grow && pdir === 'row');
  P.fillH = c.height === '100%' || (c['align-self'] === 'stretch' && pdir === 'row') || (P.grow && pdir === 'col');
  if (P.fillW) P.w = null; if (P.fillH) P.h = null;
  P.bg = parseColorStr(c.background || c['background-color'], ctx);
  P.radius = c['border-radius'] ? npx(c['border-radius'].split(/\s+/)[0]) : 0;
  const bm = c.border ? /^(\d*\.?\d+)px\s+\w+\s+(.+)$/.exec(c.border) : null;
  P.border = bm ? { w: parseFloat(bm[1]), color: parseColorStr(bm[2], ctx) } : null;
  P.shadow = parseShadow(c['box-shadow'], ctx);
  P.opacity = c.opacity ? parseFloat(c.opacity) : 1;
  P.abs = c.position === 'absolute' ? { x: npx(c.left) || 0, y: npx(c.top) || 0 } : null;
  P.size = npx(c['font-size']) || 16;
  P.weight = parseInt(c['font-weight'] || '400', 10);
  P.color = parseColorStr(c.color, ctx);
  P.lh = npx(c['line-height']);
  P.ls = npx(c['letter-spacing']);
  P.talign = c['text-align'] || '';
  P.family = (c['font-family'] || ctx.rootFont || '').replace(/var\([^,]+,?\s*/, '').replace(/[)"']/g, '').split(',')[0].trim();
  return P;
}
const n2 = v => String(round(v, 2));
const tokenId = t => camel(String(t).replace(/^--/, ''));

/* ---------- SwiftUI ---------- */
const SW_WEIGHT = { 100: 'ultraLight', 200: 'thin', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'heavy', 900: 'black' };
/* Unicode bidi controls are escaped so generated code can't hide "Trojan Source" text. */
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g;
function swStr(s) {
  return '"' + String(s).replace(/[\\"\u0000-\u001f\u007f\u202A-\u202E\u2066-\u2069]/g, c =>
    c === '\\' ? '\\\\' : c === '"' ? '\\"' : c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : '\\u{' + c.charCodeAt(0).toString(16) + '}') + '"';
}
function swColor(c, ctx) {
  if (!c) return null;
  if (c.token && ctx.tokenUse) { ctx.tokenUse[c.token] = c; return 'Color.' + tokenId(c.token); }
  return 'Color(red: ' + n2(c.r) + ', green: ' + n2(c.g) + ', blue: ' + n2(c.b) + (c.a < 1 ? ', opacity: ' + n2(c.a) : '') + ')';
}
function swPadding(p) {
  const [t, r, b, l] = p;
  if (!t && !r && !b && !l) return [];
  if (t === r && r === b && b === l) return ['.padding(' + n2(t) + ')'];
  if (t === b && l === r) return ['.padding(.horizontal, ' + n2(l) + ')', '.padding(.vertical, ' + n2(t) + ')'];
  return ['.padding(EdgeInsets(top: ' + n2(t) + ', leading: ' + n2(l) + ', bottom: ' + n2(b) + ', trailing: ' + n2(r) + '))'];
}
function swFrame(P, align) {
  const parts = [];
  if (P.w !== null) parts.push('width: ' + n2(P.w));
  if (P.h !== null) parts.push('height: ' + n2(P.h));
  if (P.fillW) parts.push('maxWidth: .infinity');
  if (P.fillH) parts.push('maxHeight: .infinity');
  if (!parts.length) return [];
  if ((P.fillW || P.fillH) && align) parts.push('alignment: ' + align);
  return ['.frame(' + parts.join(', ') + ')'];
}
function swTextChunk(text, P, extra, ctx) {
  let s = 'Text(' + swStr(text) + ')';
  const mods = [];
  if (extra) {
    if (extra['font-weight']) mods.push('.fontWeight(.' + (SW_WEIGHT[parseInt(extra['font-weight'], 10)] || 'regular') + ')');
    if (extra.color) { const col = parseColorStr(extra.color, ctx); if (col) mods.push('.foregroundColor(' + swColor(col, ctx) + ')'); }
    if (extra['text-decoration'] === 'underline') mods.push('.underline()');
    if (extra['text-decoration'] === 'line-through') mods.push('.strikethrough()');
  }
  return s + mods.join('');
}
function swText(el, P, d, ctx, prop) {
  const pad = '    '.repeat(d);
  let head;
  if (prop) head = 'Text(' + prop + ')';
  else if (el.runs) head = '(' + el.runs.map(r => swTextChunk(r.text, P, r.css, ctx)).join(' + ') + ')';
  else head = 'Text(' + swStr(el.text) + ')';
  const mods = [];
  const font = P.family && !/^(sf pro|-apple|system)/i.test(P.family) ? '.custom(' + swStr(P.family) + ', size: ' + n2(P.size) + ')' : '.system(size: ' + n2(P.size) + ')';
  mods.push('.font(' + font + (P.weight !== 400 ? '.weight(.' + (SW_WEIGHT[P.weight] || 'regular') + ')' : '') + ')');
  if (P.color) mods.push('.foregroundStyle(' + swColor(P.color, ctx) + ')');
  if (P.ls) mods.push('.tracking(' + n2(P.ls) + ')');
  if (P.lh && P.lh > P.size * 1.25) mods.push('.lineSpacing(' + n2(P.lh - P.size * 1.2) + ')');
  if (P.talign === 'center') mods.push('.multilineTextAlignment(.center)');
  if (P.talign === 'right') mods.push('.multilineTextAlignment(.trailing)');
  mods.push.apply(mods, swFrame(P, P.talign === 'center' ? '.center' : '.leading'));
  if (P.abs) mods.push('.offset(x: ' + n2(P.abs.x) + ', y: ' + n2(P.abs.y) + ')');
  return pad + head + mods.map(m => '\n' + pad + '    ' + m).join('');
}
function swNode(el, parent, d, ctx, inDef) {
  const pad = '    '.repeat(d);
  if (el.usage && !inDef) {
    return pad + el.usage.def.name + '(' + el.usage.values.map(v => v.name + ': ' + swStr(v.kind === 'img' ? v.file.replace(/\.\w+$/, '') : v.value)).join(', ') + ')';
  }
  const P = nprops(el, parent, ctx);
  if (el.kind === 'text') return swText(el, P, d, ctx, el.prop);
  if (el.kind === 'img') {
    const name = el.prop ? el.prop : swStr(el.asset.file.replace(/\.\w+$/, ''));
    const mods = ['.resizable()', '.scaledToFit()'].concat(swFrame(P, null));
    if (P.w === null && P.h === null && !P.fillW) mods.push('.frame(width: ' + n2(npx(el.css.width) || 24) + ', height: ' + n2(npx(el.css.height) || 24) + ')');
    if (!el.attrs.alt) mods.push('.accessibilityHidden(true)');
    if (P.abs) mods.push('.offset(x: ' + n2(P.abs.x) + ', y: ' + n2(P.abs.y) + ')');
    return pad + 'Image(' + name + ')' + mods.map(m => '\n' + pad + '    ' + m).join('');
  }
  // container
  let open;
  if (P.dir === 'z') open = 'ZStack(alignment: .topLeading)';
  else if (P.dir === 'row') open = 'HStack(alignment: ' + ({ center: '.center', 'flex-end': '.bottom', baseline: '.firstTextBaseline' }[P.align] || '.top') + ', spacing: ' + n2(P.justify === 'space-between' ? 0 : P.gap) + ')';
  else open = 'VStack(alignment: ' + ({ center: '.center', 'flex-end': '.trailing' }[P.align] || '.leading') + ', spacing: ' + n2(P.justify === 'space-between' ? 0 : P.gap) + ')';
  const kd = el.tag === 'button' ? d + 2 : d + 1;
  let kids = el.children.map(c => swNode(c, el, kd, ctx, inDef));
  const sp = '    '.repeat(kd) + 'Spacer(minLength: 0)';
  if (P.dir !== 'z') {
    if (P.justify === 'space-between' && kids.length > 1) kids = kids.reduce((a, k, i) => i ? a.concat([sp, k]) : [k], []);
    else if (P.justify === 'center' && (P.w || P.h || P.fillW || P.fillH)) kids = [sp].concat(kids, [sp]);
    else if (P.justify === 'flex-end') kids = [sp].concat(kids);
  }
  const mods = [];
  mods.push.apply(mods, swPadding(P.pad));
  mods.push.apply(mods, swFrame(P, P.dir === 'row' ? '.leading' : '.topLeading'));
  if (P.bg) mods.push('.background(' + swColor(P.bg, ctx) + ')');
  if (P.radius) mods.push('.clipShape(RoundedRectangle(cornerRadius: ' + n2(P.radius) + '))');
  if (P.border && P.border.color) mods.push('.overlay(RoundedRectangle(cornerRadius: ' + n2(P.radius || 0) + ').stroke(' + swColor(P.border.color, ctx) + ', lineWidth: ' + n2(P.border.w) + '))');
  if (P.shadow && P.shadow.color) mods.push('.shadow(color: ' + swColor(P.shadow.color, ctx) + ', radius: ' + n2(P.shadow.blur / 2) + ', x: ' + n2(P.shadow.x) + ', y: ' + n2(P.shadow.y) + ')');
  if (P.opacity < 1) mods.push('.opacity(' + n2(P.opacity) + ')');
  if (P.abs) mods.push('.offset(x: ' + n2(P.abs.x) + ', y: ' + n2(P.abs.y) + ')');
  if (!el.children.length && el.tag !== 'button') {
    // plain shape (track, divider, dot…): a colour view carries the modifiers
    return pad + 'Color.clear' + mods.map(m => '\n' + pad + '    ' + m).join('');
  }
  if (el.tag === 'button') {
    return pad + 'Button(action: {}) {\n' + pad + '    ' + open + ' {\n' + kids.join('\n') + '\n' + pad + '    }\n' + pad + '}' +
      '\n' + pad + '.buttonStyle(.plain)' + mods.map(m => '\n' + pad + m).join('');
  }
  return pad + open + ' {\n' + kids.join('\n') + '\n' + pad + '}' + mods.map(m => '\n' + pad + m).join('');
}
function generateSwift(root, defs, ctx, name) {
  ctx.tokenUse = {};
  const defCode = defs.map(def => {
    const props = def.props.map(p => '    let ' + p.name + ': String').join('\n');
    return 'struct ' + def.name + ': View {\n' + (props ? props + '\n\n' : '') + '    var body: some View {\n' + swNode(def.tpl, def.tpl.parent, 2, ctx, true) + '\n    }\n}';
  });
  const main = 'struct ' + name + ': View {\n    var body: some View {\n' + swNode(root, null, 2, ctx, false) + '\n    }\n}';
  let tokens = '';
  const used = Object.keys(ctx.tokenUse);
  if (used.length) {
    const dyn = used.some(t => ctx.tokenInfo[t] && Object.keys(ctx.tokenInfo[t].modes).some(m => /dark/i.test(m)));
    tokens = '\n\n// MARK: - Design tokens (from Figma variables)\nextension Color {\n' + used.map(t => {
      const ti = ctx.tokenInfo[t];
      const darkKey = ti ? Object.keys(ti.modes).find(m => /dark/i.test(m)) : null;
      const base = swColor(Object.assign({}, ctx.tokenUse[t], { token: null }), ctx);
      if (darkKey && ti.modes[darkKey] && typeof ti.modes[darkKey] === 'object') {
        const dk = ti.modes[darkKey];
        const lt = ti.defaultValue && typeof ti.defaultValue === 'object' ? ti.defaultValue : ctx.tokenUse[t];
        return '    static let ' + tokenId(t) + ' = Color(light: ' + swColor(Object.assign({}, lt, { token: null }), ctx) + ', dark: ' + swColor(Object.assign({}, dk, { token: null }), ctx) + ')';
      }
      return '    static let ' + tokenId(t) + ' = ' + base;
    }).join('\n') + '\n}' + (dyn ? '\n\nextension Color {\n    /// Light/dark aware color, mirroring Figma variable modes.\n    init(light: Color, dark: Color) {\n        self.init(UIColor { $0.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })\n    }\n}' : '');
  }
  const assets = ctx.assets.length ? '\n\n// Assets: add to Assets.xcassets → ' + ctx.assets.map(a => a.file.replace(/\.\w+$/, '')).join(', ') : '';
  return 'import SwiftUI\n\n' + defCode.concat([main]).join('\n\n') + '\n\n#Preview {\n    ' + name + '()\n}' + tokens + assets + '\n';
}

/* ---------- Jetpack Compose ---------- */
const KT_WEIGHT = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Normal', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
function ktStr(s) { return JSON.stringify(String(s)).replace(/\$/g, '\\$').replace(BIDI_RE, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')); }
function ktColor(c, ctx) {
  if (!c) return null;
  if (c.token && ctx.tokenUse) { ctx.tokenUse[c.token] = c; return 'AppColors.' + pascal(tokenId(c.token)); }
  const h = n => to255(n).toString(16).padStart(2, '0').toUpperCase();
  return 'Color(0x' + h(c.a === undefined ? 1 : c.a) + h(c.r) + h(c.g) + h(c.b) + ')';
}
const drawableName = f => f.replace(/\.\w+$/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
function ktLayoutMods(P, parentDir) {
  const m = [];
  if (P.grow && parentDir) m.push('weight(1f)');
  if (P.fillW && !(P.grow && parentDir === 'row')) m.push('fillMaxWidth()');
  if (P.fillH && !(P.grow && parentDir === 'col')) m.push('fillMaxHeight()');
  return m;
}
function ktModifier(P, parentDir, ctx, base, skipLayout) {
  const m = skipLayout ? [] : ktLayoutMods(P, parentDir);
  if (P.w !== null && P.h !== null && P.w === P.h) m.push('size(' + n2(P.w) + '.dp)');
  else { if (P.w !== null) m.push('width(' + n2(P.w) + '.dp)'); if (P.h !== null) m.push('height(' + n2(P.h) + '.dp)'); }
  if (P.abs) m.push('offset(x = ' + n2(P.abs.x) + '.dp, y = ' + n2(P.abs.y) + '.dp)');
  const shape = P.radius ? 'RoundedCornerShape(' + n2(P.radius) + '.dp)' : null;
  if (P.shadow) m.push('shadow(' + n2(Math.max(1, P.shadow.blur / 2)) + '.dp' + (shape ? ', ' + shape : '') + ')');
  if (shape && (P.bg || P.border)) m.push('clip(' + shape + ')');
  if (P.bg) m.push('background(' + ktColor(P.bg, ctx) + ')');
  if (P.border && P.border.color) m.push('border(' + n2(P.border.w) + '.dp, ' + ktColor(P.border.color, ctx) + (shape ? ', ' + shape : '') + ')');
  const [t, r, b, l] = P.pad || [0, 0, 0, 0];
  if (t || r || b || l) {
    if (t === r && r === b && b === l) m.push('padding(' + n2(t) + '.dp)');
    else if (t === b && l === r) m.push('padding(horizontal = ' + n2(l) + '.dp, vertical = ' + n2(t) + '.dp)');
    else m.push('padding(start = ' + n2(l) + '.dp, top = ' + n2(t) + '.dp, end = ' + n2(r) + '.dp, bottom = ' + n2(b) + '.dp)');
  }
  if (P.opacity < 1) m.push('alpha(' + n2(P.opacity) + 'f)');
  if (!m.length) return base === 'modifier' ? 'modifier' : null;
  return (base || 'Modifier') + m.map(x => '\n.' + x).join('');
}
function ktIndent(s, pad) { return s.split('\n').map((l, i) => i ? pad + l : l).join('\n'); }
function ktNode(el, parent, d, ctx, inDef, isRoot) {
  const pad = '    '.repeat(d);
  const parentDir = parent ? nprops(parent, null, ctx).dir : null;
  if (el.usage && !inDef) {
    const lm = ktLayoutMods(nprops(el, parent, ctx), parentDir === 'z' ? null : parentDir);
    const args = el.usage.values.map(v => v.name + ' = ' + (v.kind === 'img' ? 'R.drawable.' + drawableName(v.file) : ktStr(v.value)));
    if (lm.length) args.push('modifier = Modifier.' + lm.join('.'));
    return pad + el.usage.def.name + '(' + args.join(', ') + ')';
  }
  const P = nprops(el, parent, ctx);
  let mod = ktModifier(P, parentDir === 'z' ? null : parentDir, ctx, isRoot ? 'modifier' : null, isRoot && inDef);
  if (el.tag === 'button' && el.kind === 'box') { ctx.ktClickable = true; mod = (mod || 'Modifier') + '\n.clickable(role = Role.Button) { /* TODO: onClick */ }'; }
  const modArg = mod ? 'modifier = ' + ktIndent(mod, pad + '        ') : null;
  if (el.kind === 'text') {
    const args = [];
    if (el.prop) args.push('text = ' + el.prop);
    else if (el.runs) {
      ctx.ktAnnotated = true;
      args.push('text = buildAnnotatedString {\n' + el.runs.map(r => {
        if (!r.css) return pad + '        append(' + ktStr(r.text) + ')';
        const st = [];
        if (r.css['font-weight']) st.push('fontWeight = FontWeight.' + (KT_WEIGHT[parseInt(r.css['font-weight'], 10)] || 'Normal'));
        if (r.css.color) { const col = parseColorStr(r.css.color, ctx); if (col) st.push('color = ' + ktColor(col, ctx)); }
        if (r.css['text-decoration'] === 'underline') st.push('textDecoration = TextDecoration.Underline');
        return pad + '        withStyle(SpanStyle(' + st.join(', ') + ')) { append(' + ktStr(r.text) + ') }';
      }).join('\n') + '\n' + pad + '    }');
    } else args.push('text = ' + ktStr(el.text));
    if (modArg) args.push(modArg);
    args.push('fontSize = ' + n2(P.size) + '.sp');
    if (P.weight !== 400) args.push('fontWeight = FontWeight.' + (KT_WEIGHT[P.weight] || 'Normal'));
    if (P.color) args.push('color = ' + ktColor(P.color, ctx));
    if (P.lh) args.push('lineHeight = ' + n2(P.lh) + '.sp');
    if (P.ls) args.push('letterSpacing = ' + n2(P.ls) + '.sp');
    if (P.talign === 'center') args.push('textAlign = TextAlign.Center');
    if (P.talign === 'right') args.push('textAlign = TextAlign.End');
    return pad + 'Text(\n' + args.map(a => pad + '    ' + a).join(',\n') + ',\n' + pad + ')';
  }
  if (el.kind === 'img') {
    const args = ['painter = painterResource(' + (el.prop || 'R.drawable.' + drawableName(el.asset.file)) + ')', 'contentDescription = ' + (el.attrs.alt ? ktStr(el.attrs.alt) : 'null')];
    if (modArg) args.push(modArg);
    return pad + 'Image(\n' + args.map(a => pad + '    ' + a).join(',\n') + ',\n' + pad + ')';
  }
  const args = [];
  if (modArg) args.push(modArg);
  if (P.dir === 'row') {
    if (P.justify === 'space-between') args.push('horizontalArrangement = Arrangement.SpaceBetween');
    else if (P.gap || P.justify !== 'flex-start') args.push('horizontalArrangement = Arrangement.spacedBy(' + n2(P.gap) + '.dp' + ({ center: ', Alignment.CenterHorizontally', 'flex-end': ', Alignment.End' }[P.justify] || '') + ')');
    if (P.align !== 'flex-start') args.push('verticalAlignment = Alignment.' + ({ center: 'CenterVertically', 'flex-end': 'Bottom' }[P.align] || 'Top'));
  } else if (P.dir === 'col') {
    if (P.justify === 'space-between') args.push('verticalArrangement = Arrangement.SpaceBetween');
    else if (P.gap || P.justify !== 'flex-start') args.push('verticalArrangement = Arrangement.spacedBy(' + n2(P.gap) + '.dp' + ({ center: ', Alignment.CenterVertically', 'flex-end': ', Alignment.Bottom' }[P.justify] || '') + ')');
    if (P.align !== 'flex-start') args.push('horizontalAlignment = Alignment.' + ({ center: 'CenterHorizontally', 'flex-end': 'End' }[P.align] || 'Start'));
  }
  const comp = P.dir === 'row' ? 'Row' : P.dir === 'z' ? 'Box' : 'Column';
  const kids = el.children.map(c => ktNode(c, el, d + 1, ctx, inDef, false)).join('\n');
  const argStr = '(' + (args.length ? '\n' + args.map(a => pad + '    ' + a).join(',\n') + ',\n' + pad : '') + ')';
  let call = !el.children.length ? pad + 'Box' + argStr : pad + comp + argStr + ' {\n' + kids + '\n' + pad + '}';
  return call;
}
function generateCompose(root, defs, ctx, name) {
  ctx.tokenUse = {};
  const defCode = defs.map(def => {
    const params = def.props.map(p => p.name + ': ' + (p.kind === 'img' ? 'Int' : 'String')).concat(['modifier: Modifier = Modifier']).join(', ');
    return '@Composable\nfun ' + def.name + '(' + params + ') {\n' + ktNode(def.tpl, def.tpl.parent, 1, ctx, true, true) + '\n}';
  });
  const main = '@Composable\nfun ' + name + '(modifier: Modifier = Modifier) {\n' + ktNode(root, null, 1, ctx, false, true) + '\n}';
  const used = Object.keys(ctx.tokenUse);
  let tokens = '';
  if (used.length) {
    tokens = '\n\n// Design tokens (from Figma variables)\nobject AppColors {\n' + used.map(t => '    val ' + pascal(tokenId(t)) + ' = ' + ktColor(Object.assign({}, ctx.tokenUse[t], { token: null }), ctx)).join('\n') + '\n}';
    const dark = used.filter(t => ctx.tokenInfo[t] && Object.keys(ctx.tokenInfo[t].modes).some(m => /dark/i.test(m)));
    if (dark.length) tokens += '\n\nobject AppColorsDark {\n' + dark.map(t => { const ti = ctx.tokenInfo[t]; const dk = ti.modes[Object.keys(ti.modes).find(m => /dark/i.test(m))]; return '    val ' + pascal(tokenId(t)) + ' = ' + (typeof dk === 'object' ? ktColor(Object.assign({}, dk, { token: null }), ctx) : ktColor(Object.assign({}, ctx.tokenUse[t], { token: null }), ctx)); }).join('\n') + '\n}';
  }
  const imports = [
    'androidx.compose.foundation.Image', 'androidx.compose.foundation.background', 'androidx.compose.foundation.border',
    ctx.ktClickable ? 'androidx.compose.foundation.clickable' : null, 'androidx.compose.foundation.layout.*',
    'androidx.compose.foundation.shape.RoundedCornerShape', 'androidx.compose.material3.Text', 'androidx.compose.runtime.Composable',
    'androidx.compose.ui.Alignment', 'androidx.compose.ui.Modifier', 'androidx.compose.ui.draw.alpha', 'androidx.compose.ui.draw.clip',
    'androidx.compose.ui.draw.shadow', 'androidx.compose.ui.graphics.Color', 'androidx.compose.ui.res.painterResource', ctx.ktClickable ? 'androidx.compose.ui.semantics.Role' : null,
    ctx.ktAnnotated ? 'androidx.compose.ui.text.SpanStyle' : null, ctx.ktAnnotated ? 'androidx.compose.ui.text.buildAnnotatedString' : null,
    ctx.ktAnnotated ? 'androidx.compose.ui.text.withStyle' : null, ctx.ktAnnotated ? 'androidx.compose.ui.text.style.TextDecoration' : null,
    'androidx.compose.ui.text.font.FontWeight', 'androidx.compose.ui.text.style.TextAlign', 'androidx.compose.ui.tooling.preview.Preview',
    'androidx.compose.ui.unit.dp', 'androidx.compose.ui.unit.sp'
  ].filter(Boolean).map(i => 'import ' + i).join('\n');
  const assets = ctx.assets.length ? '\n\n// Drawables: import into res/drawable (SVG → Vector Asset): ' + ctx.assets.map(a => drawableName(a.file)).join(', ') : '';
  return imports + '\n\n' + defCode.concat([main]).join('\n\n') + '\n\n@Preview(showBackground = true)\n@Composable\nprivate fun ' + name + 'Preview() {\n    ' + name + '()\n}' + tokens + assets + '\n';
}

/* ---------- Prototype interactions ---------- */
const TRIGGERS = { ON_CLICK: 'On click', ON_HOVER: 'On hover', ON_PRESS: 'On press', ON_DRAG: 'On drag', MOUSE_ENTER: 'Mouse enter', MOUSE_LEAVE: 'Mouse leave',
  MOUSE_UP: 'Mouse up', MOUSE_DOWN: 'Mouse down', WHILE_HOVERING: 'While hovering', WHILE_PRESSED: 'While pressing', ON_KEY_DOWN: 'Key / gamepad', ON_MEDIA_HIT: 'Media hits time', ON_MEDIA_END: 'Media ends' };
const NAVS = { NAVIGATE: 'Navigate to', SWAP: 'Swap overlay', OVERLAY: 'Open overlay', SCROLL_TO: 'Scroll to', CHANGE_TO: 'Change to' };
async function nodeName(id) { try { const n = id && await figma.getNodeByIdAsync(id); return n ? n.name : ''; } catch (e) { return ''; } }
async function actionLabel(a) {
  if (!a) return '';
  if (a.type === 'BACK') return 'Back';
  if (a.type === 'CLOSE') return 'Close overlay';
  if (a.type === 'URL') return 'Open link · ' + a.url;
  if (a.type === 'SET_VARIABLE') { let nm = ''; try { const v = await figma.variables.getVariableByIdAsync(a.variableId); nm = v ? v.name : ''; } catch (e) { /* ignore */ } return 'Set variable' + (nm ? ' · ' + nm : ''); }
  if (a.type === 'SET_VARIABLE_MODE') return 'Set variable mode';
  if (a.type === 'CONDITIONAL') return 'Conditional';
  if (a.type === 'UPDATE_MEDIA_RUNTIME') return 'Media · ' + String(a.mediaAction || '').toLowerCase().replace(/_/g, ' ');
  if (a.type === 'NODE') {
    const dest = await nodeName(a.destinationId);
    const tr = a.transition ? ' · ' + String(a.transition.type).toLowerCase().replace(/_/g, ' ') + (a.transition.duration ? ' ' + Math.round(a.transition.duration * 1000) + 'ms' : '') : '';
    return (NAVS[a.navigation] || 'Go to') + (dest ? ' ' + dest : '') + tr;
  }
  return String(a.type).toLowerCase().replace(/_/g, ' ');
}
async function interactionsOf(node) {
  if (!('reactions' in node) || !node.reactions || !node.reactions.length) return undefined;
  const out = [];
  for (const r of node.reactions.slice(0, 8)) {
    const t = r.trigger || {};
    let trig = TRIGGERS[t.type] || String(t.type || 'Trigger').toLowerCase().replace(/_/g, ' ');
    if (t.type === 'AFTER_TIMEOUT') trig = 'After ' + Math.round((t.timeout || 0) * 1000) + 'ms';
    else if (t.delay) trig += ' · ' + Math.round(t.delay * 1000) + 'ms delay';
    const acts = r.actions || (r.action ? [r.action] : []);
    const labels = [];
    for (const a of acts) { const l = await actionLabel(a); if (l) labels.push(l); }
    out.push({ trigger: trig, actions: labels });
  }
  return out;
}

/* ---------- Annotations ---------- */
async function annCategories() {
  try {
    if (figma.annotations && figma.annotations.getAnnotationCategoriesAsync) {
      return (await figma.annotations.getAnnotationCategoriesAsync()).map(c => ({ id: c.id, label: c.label, color: c.color }));
    }
  } catch (e) { /* ignore */ }
  return [];
}
const NOTE_COLORS = { yellow: [1, 0.78, 0.16], orange: [1, 0.55, 0.1], red: [0.95, 0.28, 0.13], pink: [0.95, 0.35, 0.65], violet: [0.6, 0.28, 1], blue: [0.05, 0.6, 1], teal: [0.03, 0.7, 0.72], green: [0.08, 0.68, 0.36] };
function canvasNotesFor(id) {
  try { return figma.currentPage.findChildren(n => n.getSharedPluginData(NS, 'note') === id); } catch (e) { return []; }
}
/** Visible-on-every-plan fallback: a locked sticky note next to the layer, with a leader line. */
async function drawCanvasNote(node, text, color) {
  if (IS_DEV) return false;
  const bb = node.absoluteBoundingBox; if (!bb) return false;
  let top = node; while (top.parent && top.parent.type !== 'PAGE' && top.parent.type !== 'SECTION') top = top.parent;
  const tb = top.absoluteBoundingBox || bb;
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  const c = NOTE_COLORS[color] || NOTE_COLORS.green, RGB = { r: c[0], g: c[1], b: c[2] };
  const existing = canvasNotesFor(node.id);
  const card = figma.createFrame();
  card.name = 'Note'; card.layoutMode = 'VERTICAL'; card.primaryAxisSizingMode = 'AUTO'; card.counterAxisSizingMode = 'FIXED';
  card.resize(260, 40); card.paddingLeft = card.paddingRight = 12; card.paddingTop = card.paddingBottom = 10; card.itemSpacing = 4;
  card.cornerRadius = 8; card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  card.strokes = [{ type: 'SOLID', color: RGB }]; card.strokeWeight = 1.5;
  card.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 2 }, radius: 8, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const h = figma.createText(); h.fontName = { family: 'Inter', style: 'Semi Bold' }; h.fontSize = 10; h.characters = '📝 ' + node.name; h.fills = [{ type: 'SOLID', color: RGB }];
  const t = figma.createText(); t.fontName = { family: 'Inter', style: 'Regular' }; t.fontSize = 12; t.lineHeight = { unit: 'PIXELS', value: 17 };
  t.characters = String(text).replace(/[#*_`>]/g, '').trim() || '(note)'; t.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
  card.appendChild(h); card.appendChild(t); h.layoutAlign = 'STRETCH'; t.layoutAlign = 'STRETCH'; t.textAutoResize = 'HEIGHT';
  const cy = bb.y + bb.height / 2;
  card.x = tb.x + tb.width + 48;
  card.y = cy - 16 + existing.reduce((sum, g) => sum + g.height + 8, 0);
  const startX = bb.x + bb.width;
  const line = figma.createRectangle(); line.name = 'Leader'; line.fills = [{ type: 'SOLID', color: RGB }];
  line.resize(Math.max(1, card.x - startX), 1.5); line.x = startX; line.y = cy - 0.75;
  const dot = figma.createEllipse(); dot.name = 'Dot'; dot.resize(8, 8); dot.x = startX - 4; dot.y = cy - 4; dot.fills = [{ type: 'SOLID', color: RGB }];
  const g = figma.group([line, dot, card], figma.currentPage);
  g.name = '📝 DevReady note · ' + node.name; g.locked = true;
  g.setSharedPluginData(NS, 'note', node.id); g.setSharedPluginData(NS, 'noteText', String(text));
  return true;
}
function annotateError(e, node) {
  const m = String(e && e.message || e);
  if (/instance/i.test(m)) return new Error('Figma can’t annotate this layer inside an instance — annotate the instance itself or the main component.');
  if (/permission|read.?only|edit access|cannot (set|edit)/i.test(m)) return new Error('No edit access — annotations need a Full seat with “can edit” access to this file.');
  return new Error('Could not add the annotation on “' + node.name + '”: ' + m);
}
function inViewport(node) {
  const v = figma.viewport.bounds, b = node.absoluteBoundingBox;
  return b && b.x < v.x + v.width && b.x + b.width > v.x && b.y < v.y + v.height && b.y + b.height > v.y;
}
function cleanAnnotation(a) {
  const o = {};
  if (a.labelMarkdown) o.labelMarkdown = a.labelMarkdown; else if (a.label) o.label = a.label;
  if (a.properties && a.properties.length) o.properties = a.properties.map(p => ({ type: p.type }));
  if (a.categoryId) o.categoryId = a.categoryId;
  return o;
}
/* ------------------------------------------------------------------ */
/* Measurements & redlines                                             */
/* ------------------------------------------------------------------ */
function measurePair(a, b) {
  const A = a.absoluteBoundingBox, B = b.absoluteBoundingBox;
  if (!A || !B) return null;
  const inside = (o, i) => i.x >= o.x && i.y >= o.y && i.x + i.width <= o.x + o.width && i.y + i.height <= o.y + o.height;
  const segs = [];
  let result;
  if (inside(A, B) || inside(B, A)) {
    const O = inside(A, B) ? A : B, I = O === A ? B : A;
    const cx = I.x + I.width / 2, cy = I.y + I.height / 2;
    result = {
      mode: 'inset',
      outer: O === A ? a.name : b.name,
      inner: O === A ? b.name : a.name,
      top: round(I.y - O.y), left: round(I.x - O.x),
      right: round(O.x + O.width - (I.x + I.width)), bottom: round(O.y + O.height - (I.y + I.height))
    };
    segs.push({ x1: cx, y1: O.y, x2: cx, y2: I.y, v: result.top });
    segs.push({ x1: cx, y1: I.y + I.height, x2: cx, y2: O.y + O.height, v: result.bottom });
    segs.push({ x1: O.x, y1: cy, x2: I.x, y2: cy, v: result.left });
    segs.push({ x1: I.x + I.width, y1: cy, x2: O.x + O.width, y2: cy, v: result.right });
  } else {
    result = { mode: 'gap', a: a.name, b: b.name, horizontal: null, vertical: null };
    const oy1 = Math.max(A.y, B.y), oy2 = Math.min(A.y + A.height, B.y + B.height);
    const ox1 = Math.max(A.x, B.x), ox2 = Math.min(A.x + A.width, B.x + B.width);
    const midY = oy2 > oy1 ? (oy1 + oy2) / 2 : A.y + A.height / 2;
    const midX = ox2 > ox1 ? (ox1 + ox2) / 2 : A.x + A.width / 2;
    if (B.x >= A.x + A.width) { result.horizontal = round(B.x - (A.x + A.width)); segs.push({ x1: A.x + A.width, y1: midY, x2: B.x, y2: midY, v: result.horizontal }); }
    else if (A.x >= B.x + B.width) { result.horizontal = round(A.x - (B.x + B.width)); segs.push({ x1: B.x + B.width, y1: midY, x2: A.x, y2: midY, v: result.horizontal }); }
    if (B.y >= A.y + A.height) { result.vertical = round(B.y - (A.y + A.height)); segs.push({ x1: midX, y1: A.y + A.height, x2: midX, y2: B.y, v: result.vertical }); }
    else if (A.y >= B.y + B.height) { result.vertical = round(A.y - (B.y + B.height)); segs.push({ x1: midX, y1: B.y + B.height, x2: midX, y2: A.y, v: result.vertical }); }
  }
  result.segments = segs;
  return result;
}
function measureToParent(node) {
  const p = node.parent;
  if (!p || !('absoluteBoundingBox' in p) || !p.absoluteBoundingBox || p.type === 'PAGE') return null;
  return measurePair(p, node);
}

async function drawRedlines(segments) {
  if (IS_DEV) throw new Error('Redlines need Design mode (Dev Mode is read-only).');
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  const RED = [{ type: 'SOLID', color: { r: 0.96, g: 0.26, b: 0.21 } }];
  const nodes = [];
  for (const s of segments) {
    if (!s.v) continue;
    const horizontal = Math.abs(s.y1 - s.y2) < 0.01;
    const line = figma.createRectangle();
    line.fills = RED;
    if (horizontal) { line.resize(Math.max(Math.abs(s.x2 - s.x1), 0.01), 1); line.x = Math.min(s.x1, s.x2); line.y = s.y1 - 0.5; }
    else { line.resize(1, Math.max(Math.abs(s.y2 - s.y1), 0.01)); line.x = s.x1 - 0.5; line.y = Math.min(s.y1, s.y2); }
    nodes.push(line);

    const pill = figma.createFrame();
    pill.layoutMode = 'HORIZONTAL';
    pill.primaryAxisSizingMode = 'AUTO';
    pill.counterAxisSizingMode = 'AUTO';
    pill.paddingLeft = pill.paddingRight = 4;
    pill.paddingTop = pill.paddingBottom = 1;
    pill.cornerRadius = 3;
    pill.fills = RED;
    const t = figma.createText();
    t.fontName = { family: 'Inter', style: 'Medium' };
    t.fontSize = 10;
    t.characters = String(round(s.v, 1));
    t.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    pill.appendChild(t);
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    pill.x = horizontal ? cx - pill.width / 2 : cx + 4;
    pill.y = horizontal ? cy - pill.height - 3 : cy - pill.height / 2;
    nodes.push(pill);
  }
  if (!nodes.length) return 0;
  const g = figma.group(nodes, figma.currentPage);
  g.name = '📏 DevReady redlines';
  g.locked = true;
  g.setSharedPluginData(NS, 'redlines', '1');
  return segments.length;
}
function clearRedlines() {
  if (IS_DEV) return 0;
  const found = figma.currentPage.findChildren(n => n.getSharedPluginData(NS, 'redlines') === '1');
  found.forEach(n => n.remove());
  return found.length;
}

/* ================================================================== */
/* MODE 1: Codegen (Dev Mode → Code section)                           */
/* ================================================================== */
if (figma.mode === 'codegen') {
  figma.codegen.on('generate', async function (event) {
    const node = event.node;
    const prefs = figma.codegen.preferences || {};
    const unit = prefs.unit === 'SCALED' ? 'rem' : 'px';
    const base = prefs.scaleFactor || 16;
    const gate = (prefs.customSettings && prefs.customSettings.gate) || 'strict';
    const status = findDevStatus(node);
    if (gate === 'strict' && !status) {
      return [{
        title: '🔒 Not ready for dev',
        language: 'PLAINTEXT',
        code: '"' + node.name + '" is not inside a design marked "Ready for dev".\n\n' +
          'Ask the designer to mark the frame/section as Ready for dev,\n' +
          'or switch the "Dev-ready gate" preference to "Always generate".'
      }];
    }
    let header = status ? (status.type === 'COMPLETED' ? '✅ Completed' : '🟢 Ready for dev') + ' · ' + status.nodeName : '⚪ No dev status (gate off)';
    try {
      if (status) { const cont = await figma.getNodeByIdAsync(status.nodeId); const d = cont && diffBaseline(cont); if (d && d.count) header += ' · ⚠ ' + d.count + ' change' + (d.count > 1 ? 's' : '') + ' since ready'; }
    } catch (e) { /* ignore */ }
    const out = await generateCode(node, event.language, unit, base, 150, { inlineBudget: 400 * 1024, fastFonts: true });
    const LANG = { html: 'HTML', css: 'CSS', jsx: 'JAVASCRIPT', swift: 'SWIFT', kotlin: 'KOTLIN', text: 'PLAINTEXT' };
    const res = out.files.map((f, i) => ({ title: (i === 0 ? header + '  ·  ' : '') + f.name, language: LANG[f.lang] || 'PLAINTEXT', code: f.code }));
    if (out.assets.length) res.push({ title: 'Assets (export from the DevReady panel → Download project)', language: 'PLAINTEXT', code: out.assets.map(a => 'assets/' + a.file + (a.scale > 1 ? '  (@' + a.scale + 'x)' : '')).join('\n') });
    return res;
  });
} else {
  /* ================================================================ */
  /* MODE 2: Inspect UI (Design mode + Dev Mode Inspect panel)        */
  /* ================================================================ */
  figma.showUI(__html__, { width: 480, height: 820, themeColors: true, title: 'DevReady Inspect' });

  let reqId = 0;
  let timer = null;
  let lastSegments = [];
  let lastThumbKey = '';

  function post(msg) { figma.ui.postMessage(msg); }

  async function refresh() {
    const my = ++reqId;
    const sel = figma.currentPage.selection;
    const base = { editor: figma.editorType, isDev: IS_DEV, settings: settings };

    if (!sel.length) {
      lastSegments = [];
      lastThumbKey = '';
      post(Object.assign({ type: 'state', mode: 'empty', ready: listReady(), page: figma.currentPage.name }, base));
      return;
    }

    const node = sel[0];
    const status = findDevStatus(node);
    const target = markTarget(node);

    if (settings.gate === 'strict' && !status) {
      lastSegments = [];
      lastThumbKey = '';
      post(Object.assign({
        type: 'state', mode: 'locked',
        node: { id: node.id, name: node.name, type: node.type },
        target: target ? { id: target.id, name: target.name, type: target.type } : null,
        ready: listReady()
      }, base));
      return;
    }

    post({ type: 'loading' });
    const spec = await extractSpec(node);
    if (my !== reqId) return;
    const css = await safeCSS(node);
    if (my !== reqId) return;

    let measure = null;
    if (sel.length === 2) measure = measurePair(sel[0], sel[1]);
    else if (sel.length === 1) measure = measureToParent(node);
    lastSegments = measure ? measure.segments : [];

    // Changes since the design was handed off
    let changes = null;
    if (status && status.type !== 'COMPLETED_NONE') {
      try {
        const cont = await figma.getNodeByIdAsync(status.nodeId);
        if (cont) changes = diffBaseline(cont) || { none: true, containerId: cont.id, containerName: cont.name };
      } catch (e) { /* ignore */ }
    }
    if (my !== reqId) return;

    const assets = collectAssets(node, 60);
    // Include the selected node itself as the first asset row
    assets.unshift({ id: node.id, name: node.name, type: node.type, kind: 'selection', w: round(node.width), h: round(node.height) });

    post(Object.assign({
      type: 'state', mode: 'inspect',
      count: sel.length,
      status: status,
      target: target ? { id: target.id, name: target.name, type: target.type } : null,
      spec: spec,
      css: groupedCSS(css, settings.unit, settings.remBase, spec.text && spec.text.segments[0] ? spec.text.segments[0].styleName : null),
      tailwind: cssToTailwind(css, settings.unit, settings.remBase).join(' '),
      measure: measure,
      changes: changes,
      assets: assets
    }, base));

    // Thumbnails (only when the selection itself changes, not on every edit)
    const key = sel.map(n => n.id).join(',');
    if (key !== lastThumbKey) {
      lastThumbKey = key;
      for (const a of assets.slice(0, 24)) {
        if (my !== reqId) return;
        try {
          const n = await figma.getNodeByIdAsync(a.id);
          const big = Math.max(n.width, n.height) || 1;
          const bytes = await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: Math.min(4, 160 / big) } });
          if (my !== reqId) return;
          post({ type: 'thumb', id: a.id, bytes: bytes });
        } catch (e) { /* skip */ }
      }
    }
  }

  function schedule(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; refresh().catch(err => post({ type: 'error', message: String(err && err.message || err) })); }, typeof delay === 'number' ? delay : 120);
  }

  function watchPage() {
    try { figma.currentPage.on('nodechange', () => { Object.keys(diffCache).forEach(k => { diffCache[k] = null; }); schedule(400); }); } catch (e) { /* ignore */ }
  }

  figma.on('selectionchange', () => schedule(80));
  figma.on('currentpagechange', () => { watchPage(); schedule(); });
  watchPage();

  figma.ui.onmessage = async function (msg) {
    try {
      switch (msg.type) {
        case 'ui-ready': {
          const saved = await figma.clientStorage.getAsync('devready-settings');
          if (saved) settings = Object.assign({}, DEFAULT_SETTINGS, saved);
          schedule();
          break;
        }
        case 'settings': {
          settings = Object.assign({}, settings, msg.settings);
          await figma.clientStorage.setAsync('devready-settings', settings);
          schedule();
          break;
        }
        case 'select': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (n && n.type !== 'PAGE' && n.type !== 'DOCUMENT') {
            figma.currentPage.selection = [n];
            figma.viewport.scrollAndZoomIntoView([n]);
          }
          break;
        }
        case 'mark': {
          const r = await setReady(msg.id, msg.status, msg.note);
          if (r.ok) {
            figma.notify(msg.status
              ? (r.native ? '🟢 "' + r.name + '" marked Ready for dev' : '🟢 "' + r.name + '" flagged ready (plugin flag)')
              : '"' + r.name + '" status cleared');
          } else figma.notify(r.error, { error: true });
          schedule();
          break;
        }
        case 'export': {
          const f = await exportNode(msg.id, msg.format, msg.scale);
          post({ type: 'download', files: [f], zip: false });
          break;
        }
        case 'export-all': {
          const files = [];
          const used = {};
          for (const item of msg.items) {
            try {
              const f = await exportNode(item.id, item.format, item.scale);
              let name = f.name;
              if (used[name]) { used[name]++; name = name.replace(/(\.[a-z]+)$/, '-' + used[name] + '$1'); } else used[name] = 1;
              files.push({ name: name, bytes: f.bytes });
            } catch (e) { /* skip */ }
          }
          post({ type: 'download', files: files, zip: true, zipName: msg.zipName || 'assets.zip' });
          break;
        }
        case 'gen-code': {
          const sel = figma.currentPage.selection;
          if (!sel.length) break;
          const out = await generateCode(sel[0], msg.lang, settings.unit, settings.remBase, 600);
          post({ type: 'code', lang: msg.lang, out: out });
          break;
        }
        case 'design-shot': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (!n || !('exportAsync' in n)) break;
          const big = Math.max(n.width, n.height) || 1;
          const scale = Math.min(2, 4096 / big);
          const bytes = await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
          post({ type: 'design-shot', id: n.id, bytes: bytes, w: round(n.width), h: round(n.height) });
          break;
        }
        case 'export-project': {
          const sel = figma.currentPage.selection;
          if (!sel.length) break;
          const out = await generateCode(sel[0], msg.lang, settings.unit, settings.remBase, 1500, { withFonts: true });
          const files = out.files.map(f => ({ name: f.name, text: f.code }));
          (out.fontFiles || []).forEach(f => files.push({ name: f.name, bytes: f.bytes }));
          for (const a of out.assets) {
            try {
              const n = await figma.getNodeByIdAsync(a.id);
              const opts = { format: a.format };
              if (a.format === 'PNG' || a.format === 'JPG') opts.constraint = { type: 'SCALE', value: a.scale };
              if (a.format === 'SVG') opts.svgOutlineText = true;
              files.push({ name: 'assets/' + a.file, bytes: await n.exportAsync(opts) });
            } catch (e) { /* skip */ }
          }
          post({ type: 'project', files: files, zipName: slug(sel[0].name) + '-' + msg.lang + '.zip', single: files.length === 1 });
          break;
        }
        case 'font-upload': {
          if (!msg.bytes || msg.bytes.length > 2.5 * 1024 * 1024) { figma.notify('Font file too large (max 2.5 MB) — use .woff2', { error: true }); break; }
          await figma.clientStorage.setAsync('font:' + msg.family + '|' + msg.key, { ext: msg.ext, bytes: msg.bytes, name: msg.name || '' });
          if (msg.last) { figma.notify('🔤 Font saved — it will be embedded in the HTML'); post({ type: 'fonts-updated' }); }
          break;
        }
        case 'font-remove': {
          await figma.clientStorage.deleteAsync('font:' + msg.family + '|' + msg.key);
          figma.notify('Font file removed'); post({ type: 'fonts-updated' });
          break;
        }
        case 'baseline-save': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (n) { saveBaseline(n); figma.notify('✓ Baseline saved — future edits will show as changes'); }
          schedule();
          break;
        }
        case 'measure-native': {
          const sel = figma.currentPage.selection;
          let added = 0, failed = false;
          try { added = addNativeMeasurements(sel); } catch (e) { failed = true; }
          if (added) figma.notify('📏 ' + added + ' measurement' + (added > 1 ? 's' : '') + ' added' + (IS_DEV ? ' (visible in Dev Mode)' : ''));
          else if (!IS_DEV) { const n = await drawRedlines(lastSegments); figma.notify(n ? '📏 Redlines drawn (native measurements unavailable here)' : 'Nothing to measure'); }
          else figma.notify(failed ? 'Measurements API not available in this Figma version' : 'Nothing measurable — select a layer inside a frame, or two layers', { error: !added });
          break;
        }
        case 'measure-clear': {
          const n = clearNativeMeasurements(figma.currentPage.selection);
          const r = IS_DEV ? 0 : clearRedlines();
          figma.notify(n || r ? 'Cleared ' + (n ? n + ' measurement(s)' : '') + (n && r ? ' and ' : '') + (r ? r + ' redline group(s)' : '') : 'No measurements on the selection');
          break;
        }
        case 'annotate-add': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (!n) break;
          const text = String(msg.label || '').trim();
          if (!('annotations' in n)) {
            // Groups, sections, boolean shapes and slices can't hold native annotations
            if (msg.pin && !IS_DEV && await drawCanvasNote(n, text, msg.color)) { figma.notify('📝 ' + n.type.toLowerCase() + ' layers can’t hold Figma annotations — added a canvas note instead'); schedule(); break; }
            figma.notify('Figma annotations can’t be added to ' + n.type.toLowerCase() + ' layers — select a frame, shape, text or instance', { error: true });
            break;
          }
          const before = n.annotations.length;
          const keep = n.annotations.map(cleanAnnotation);
          const a = {};
          if (text) a.labelMarkdown = text;
          if (msg.prop) a.properties = [{ type: msg.prop }];
          if (msg.cat) a.categoryId = msg.cat;
          let note = '', failErr = null;
          try { n.annotations = keep.concat([a]); }
          catch (e) {
            if (!a.properties && !a.categoryId) failErr = annotateError(e, n);
            else {
              delete a.properties; delete a.categoryId;
              if (!a.labelMarkdown) a.labelMarkdown = '(note)';
              try { n.annotations = keep.concat([a]); note = ' (pinned property not supported on this layer — note only)'; }
              catch (e2) { failErr = annotateError(e2, n); }
            }
          }
          const ok = !failErr && n.annotations.length > before;
          if (failErr && IS_DEV) throw failErr;
          let pinned = false;
          if (msg.pin || !ok) pinned = await drawCanvasNote(n, text || (msg.prop || ''), msg.color).catch(() => false);
          if (!inViewport(n)) { try { figma.viewport.scrollAndZoomIntoView([n]); } catch (e) { /* ignore */ } }
          if (ok) figma.notify('📝 Annotation added' + note + (pinned ? ' + canvas note' : '') + '. Not on canvas? Press Shift+Y (View → Annotations)', { timeout: 6000 });
          else if (failErr && !pinned) throw failErr;
          else figma.notify(pinned ? (failErr ? failErr.message.replace(/\.?$/, '.') + ' Added a canvas note instead.' : 'Figma didn’t keep the native annotation (needs a paid plan) — added a canvas note instead') : 'Figma didn’t keep the annotation — native annotations need a paid plan and edit access', { error: !pinned, timeout: 7000 });
          post({ type: 'ann-result', ok: ok, pinned: pinned });
          schedule();
          break;
        }
        case 'annotate-remove': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (n && 'annotations' in n) {
            const gone = n.annotations[msg.index];
            n.annotations = n.annotations.map(cleanAnnotation).filter((a, i) => i !== msg.index);
            const txt = gone ? (gone.labelMarkdown || gone.label || '') : '';
            if (!IS_DEV) canvasNotesFor(n.id).filter(g => g.getSharedPluginData(NS, 'noteText') === txt).forEach(g => g.remove());
            figma.notify('Annotation removed');
          }
          schedule();
          break;
        }
        case 'notes-clear': {
          if (IS_DEV) break;
          const all = figma.currentPage.findChildren(g => !!g.getSharedPluginData(NS, 'note'));
          all.forEach(g => g.remove());
          figma.notify(all.length ? 'Removed ' + all.length + ' canvas note(s)' : 'No canvas notes on this page');
          schedule();
          break;
        }
        case 'goto': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (n) { try { figma.viewport.scrollAndZoomIntoView([n]); } catch (e) { /* ignore */ } }
          break;
        }
        case 'devres-add': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (!n || !('addDevResourceAsync' in n)) { figma.notify('Dev resources are not supported on this layer', { error: true }); break; }
          await n.addDevResourceAsync(msg.url, msg.name || undefined);
          figma.notify('🔗 Link added');
          schedule();
          break;
        }
        case 'devres-remove': {
          const n = await figma.getNodeByIdAsync(msg.id);
          if (n && 'deleteDevResourceAsync' in n) { await n.deleteDevResourceAsync(msg.url); figma.notify('Link removed'); }
          schedule();
          break;
        }
        case 'map-save': {
          if (!msg.key || !/^[A-Za-z_$][\w$.]*$/.test(msg.name || '')) { figma.notify('Enter a valid component name', { error: true }); break; }
          figma.root.setSharedPluginData(NS, 'map:' + msg.key, JSON.stringify({ name: msg.name, path: msg.path || './' + msg.name, at: new Date().toISOString() }));
          figma.notify('🔗 Mapped to <' + msg.name + '> — generated code now uses it');
          schedule();
          break;
        }
        case 'map-remove': {
          figma.root.setSharedPluginData(NS, 'map:' + msg.key, '');
          figma.notify('Mapping removed');
          schedule();
          break;
        }
        case 'redlines': {
          const n = await drawRedlines(lastSegments);
          figma.notify(n ? '📏 Redlines drawn' : 'Nothing to measure');
          break;
        }
        case 'clear-redlines': {
          const n = clearRedlines();
          figma.notify(n ? 'Removed ' + n + ' redline group(s)' : 'No redlines on this page');
          break;
        }
        case 'notify':
          figma.notify(msg.text, msg.error ? { error: true } : undefined);
          break;
        case 'resize':
          if (!IS_DEV) figma.ui.resize(Math.max(360, msg.w), Math.max(420, msg.h));
          break;
      }
    } catch (err) {
      figma.notify(String(err && err.message || err), { error: true });
      post({ type: 'error', message: String(err && err.message || err) });
    }
  };
}
