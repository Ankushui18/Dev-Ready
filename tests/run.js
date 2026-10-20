#!/usr/bin/env node
/**
 * DevReady code-generation test suite.
 *
 *   npm test                 run everything
 *   npm test -- --only=card  run fixtures whose name contains "card"
 *   npm test -- --dump       print generated files for failing cases
 *   npm test -- --report     also write docs/test-report.md
 *
 * For every fixture × every output language it checks that:
 *   1. generation succeeds,
 *   2. the output is syntactically valid for that language (see validators.js),
 *   3. expected properties are present (fixture.expect),
 *   4. design data can't inject markup or break string literals (hostile fixture).
 * Plus privacy and offline checks on the Google Fonts lookup.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createBuilders, loadEngine, CODE } = require('./harness');
const { validateFile } = require('./validators');
const FIXTURES = require('./fixtures');

const LANGS = ['react-tailwind', 'react-css', 'react-ts', 'react-tailwind-ts', 'html-css', 'html-single', 'vue', 'svelte', 'react-native', 'swiftui', 'compose', 'flutter'];
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const DUMP = args.includes('--dump');
const REPORT = args.includes('--report');

const results = [];
let failed = 0;
const C = { g: s => '\x1b[32m' + s + '\x1b[0m', r: s => '\x1b[31m' + s + '\x1b[0m', d: s => '\x1b[2m' + s + '\x1b[0m' };

function record(group, name, errs, extra) {
  results.push({ group, name, ok: !errs.length, errs, extra: extra || '' });
  if (errs.length) failed++;
  console.log((errs.length ? C.r('  ✗ ') : C.g('  ✓ ')) + name + (extra ? C.d('  ' + extra) : ''));
  errs.slice(0, 6).forEach(e => console.log(C.r('      → ' + e)));
}

async function runFixture(fx) {
  console.log('\n' + fx.name + C.d(' — ' + fx.about));
  for (const lang of LANGS) {
    const B = createBuilders();
    const root = fx.build(B);
    root.parent = { type: 'PAGE', name: 'Page 1' };
    const eng = loadEngine(B);
    const errs = [];
    let out;
    const t0 = Date.now();
    try { out = await eng.generateCode(root, lang, 'px', 16, (fx.opts && fx.opts.maxNodes) || 600, {}); }
    catch (e) { record(fx.name, lang, ['generateCode threw: ' + (e && e.stack || e)]); continue; }
    const ms = Date.now() - t0;
    if (!out || !out.files || !out.files.length) errs.push('no files generated');
    const all = (out.files || []).map(f => f.code).join('\n');
    (out.files || []).forEach(f => validateFile(f).forEach(e => errs.push(f.name + ': ' + e)));

    const ex = fx.expect || {};
    (ex.contains && ex.contains[lang] || []).forEach(s => { if (!all.includes(s)) errs.push('missing expected: ' + JSON.stringify(s)); });
    if (ex.truncated !== undefined) {
      if (!!out.truncated !== ex.truncated) errs.push('truncated=' + out.truncated + ', expected ' + ex.truncated);
      if (ex.truncated && !/truncated/i.test(all)) errs.push('truncation is not visible in the generated code');
    }
    if (ex.assets !== undefined && lang === 'html-css' && (out.assets || []).length !== ex.assets) errs.push('assets=' + (out.assets || []).length + ', expected ' + ex.assets);
    if (ex.hostile) {
      if (/^html/.test(lang) && /<img src=x/i.test(all)) errs.push('raw hostile <img> markup leaked into HTML');
      if (/^(html|vue|svelte|react-(tailwind|css))/.test(lang) && /onload="alert/i.test(all)) errs.push('attribute injection via layer name');
    }
    if (ms > 2500) errs.push('took ' + ms + 'ms — over the codegen budget (3s)');
    const stats = out.stats ? out.stats.layers + ' layers · ' + out.stats.classes + ' classes · ' + (out.assets || []).length + ' assets' : '';
    record(fx.name, lang, errs, stats + ' · ' + ms + 'ms');
    if (errs.length && DUMP) (out.files || []).forEach(f => console.log(C.d('---- ' + f.name + '\n' + f.code.slice(0, 4000))));
  }
}

async function privacyAndOffline() {
  console.log('\nprivacy & offline' + C.d(' — what leaves the plugin, and behaviour with no network'));
  const fontFx = B => B.AL('Brand', 'VERTICAL', { gap: '4px' }, [
    B.T('Public font', { 'font-family': 'Inter', 'font-weight': '600' }),
    B.T('Secret font', { 'font-family': 'Acme Internal Display', 'font-weight': '700' }),
    B.T('Variable weight', { 'font-family': 'Space Grotesk', 'font-weight': '450' }),
    B.T('System font', { 'font-family': 'SF Pro Text' })
  ], { width: 300, height: 120 });
  // 1) code.js makes no network requests at all, even when fetch is available
  {
    const B = createBuilders(); const root = fontFx(B); root.parent = { type: 'PAGE' };
    const eng = loadEngine(B, { fetch: async () => ({ status: 200 }) });
    const errs = [];
    let out;
    try { out = await eng.generateCode(root, 'html-single', 'px', 16, 600, {}); } catch (e) { errs.push('threw: ' + e.message); }
    if (eng.fetched.length) errs.push('code.js made ' + eng.fetched.length + ' request(s): ' + eng.fetched[0]);
    const code = out ? out.files[0].code : '';
    const links = code.match(/https:\/\/fonts\.googleapis\.com\/[^"')\s]+/g) || [];
    if (!links.some(u => /family=Inter:wght@600/.test(u))) errs.push('Inter 600 not linked from Google Fonts: ' + links.join(' '));
    if (!links.some(u => /family=Space\+Grotesk:wght@450/.test(u))) errs.push('variable weight 450 of Space Grotesk not linked');
    if (links.some(u => /Acme|SF\+Pro/i.test(u))) errs.push('private/system font name sent in a Google Fonts URL');
    if (!/font-family:\s*"?Acme Internal Display"?,[^;]*sans-serif/.test(code)) errs.push('no fallback stack for the private font');
    record('privacy', 'code.js makes no network requests; only public Google families are ever linked', errs, links.length + ' Google link(s)');
  }
  // 2) the bundled catalog answers correctly
  {
    const B = createBuilders(); const eng = loadEngine(B);
    const errs = [];
    const q = (f, k) => eng.ctx.googleCheck(f, k);
    const a = q('Inter', ['0,400', '1,700']); if (!a.google || a.ok.join(';') !== '0,400;1,700') errs.push('Inter: ' + JSON.stringify(a));
    const b = q('inter', ['0,500']); if (!b.google || b.family !== 'Inter') errs.push('case-insensitive lookup failed');
    const c = q('Gilroy', ['0,700']); if (c.google) errs.push('Gilroy (commercial) reported as Google');
    const d = q('Bebas Neue', ['0,700']); if (!d.google || d.ok[0] !== '0,400') errs.push('Bebas Neue 700 should fall back to 400: ' + JSON.stringify(d));
    const e = q('Abril Fatface', ['1,400']); if (e.ok[0] !== '0,400') errs.push('missing italic should fall back to upright');
    record('privacy', 'bundled Google Fonts catalog: weights, italics, variable ranges, fallbacks', errs, eng.run('GF_DATA.split(";").length') + ' families');
  }
  // 3) Static: no network APIs in code.js; manifest limited to Google Fonts
  {
    const errs = [];
    if (/\bfetch\s*\(/.test(CODE)) errs.push('code.js calls fetch()');
    if (/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(CODE)) errs.push('other network API used in code.js');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'devready-plugin', 'manifest.json'), 'utf8'));
    const allowed = (manifest.networkAccess && manifest.networkAccess.allowedDomains) || [];
    allowed.forEach(d => { if (!/fonts\.(googleapis|gstatic)\.com/.test(d)) errs.push('manifest allows ' + d); });
    if (/no data is sent/i.test(manifest.networkAccess.reasoning || '')) errs.push('manifest reasoning claims "no data is sent"');
    record('privacy', 'no network APIs in code.js; manifest allows only Google Fonts, with accurate reasoning', errs, 'allowedDomains: ' + allowed.join(', '));
  }
}

async function changeTracking() {
  console.log('\nchange tracking' + C.d(' — snapshots respect Figma\'s 100 kB plugin-data limit'));
  const mkStore = () => {
    const data = {};
    return {
      data,
      get: (ns, k) => data[ns + '/' + k] || '',
      set: (ns, k, v) => { const size = Buffer.byteLength(ns + k + v, 'utf8'); if (size > 100 * 1024) throw new Error('in setSharedPluginData: This pluginData entry exceeds 100 kB per entry limit.'); if (v) data[ns + '/' + k] = v; else delete data[ns + '/' + k]; }
    };
  };
  const build = (B, rows) => {
    const st = mkStore();
    const root = B.AL('Big screen', 'VERTICAL', { gap: '4px' }, Array.from({ length: rows }, (_, i) => B.AL('Row ' + i + ' with a fairly long descriptive layer name', 'HORIZONTAL', {}, [B.T('Item label ' + i, {}), B.T('Détail ✓ ' + i, {})])), { width: 360, height: 9000 });
    root.getSharedPluginData = st.get; root.setSharedPluginData = st.set; root.parent = { type: 'PAGE' };
    return { root, st };
  };
  for (const [rows, label] of [[40, 'small frame (120 layers)'], [1200, 'large frame (3,600 layers, over the 2,500 cap)']]) {
    const B = createBuilders(); const { root, st } = build(B, rows); const eng = loadEngine(B);
    const errs = [];
    try {
      eng.ctx.saveBaseline(root);
      const chunks = Object.keys(st.data).filter(k => /baseline:\d+$/.test(k)).length;
      const clean = eng.ctx.diffBaseline(root);
      if (clean.count) errs.push('fresh baseline reports ' + clean.count + ' changes');
      root.children[1].children[0].characters = 'Edited';
      root.children[1].children[0]._css.color = '#FF0000';
      root.children[3].name = 'Renamed row';
      eng.run('diffCache')[root.id] = null;
      const d = eng.ctx.diffBaseline(root);
      const names = d.changes.map(c => c.kind + ':' + c.name);
      if (!d.changes.some(c => c.parts.includes('text'))) errs.push('text edit not detected: ' + names.join(', '));
      if (!d.changes.some(c => c.parts.includes('renamed'))) errs.push('rename not detected');
      const txt = d.changes.find(c => c.parts.includes('text'));
      const tl = txt && (txt.detail || []).find(x => x.prop === 'Text');
      if (!tl || tl.before !== 'Item label 1' || tl.after !== 'Edited') errs.push('text before/after wrong: ' + JSON.stringify(tl));
      const rn = d.changes.find(c => c.parts.includes('renamed'));
      const nl = rn && (rn.detail || []).find(x => x.prop === 'Name');
      if (!nl || nl.after !== 'Renamed row' || !/^Row 3/.test(nl.before)) errs.push('rename before/after wrong: ' + JSON.stringify(nl));
      if (!d.values) errs.push('values flag not set');
      if (d.changes.some(c => c.kind !== 'changed')) errs.push('false added/removed: ' + names.filter(n => !/^changed/.test(n)).slice(0, 3).join(', '));
      if (rows > 1000 && !d.partial) errs.push('partial scan not flagged');
      if (rows < 100 && d.partial) errs.push('small frame flagged partial');
      record('changes', label, errs, chunks + ' chunk' + (chunks > 1 ? 's' : '') + ' · ' + d.count + ' changes' + (d.partial ? ' · partial' : ''));
    } catch (e) { record('changes', label, ['threw: ' + e.message]); }
  }
  {
    const B = createBuilders(); const { root } = build(B, 3); const eng = loadEngine(B);
    const card = root.children[0];
    card.fills = [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 }, opacity: 1 }];
    card.layoutMode = 'HORIZONTAL'; card.itemSpacing = 8; card.paddingTop = card.paddingBottom = 8; card.paddingLeft = card.paddingRight = 12;
    const errs = [];
    eng.ctx.saveBaseline(root);
    card.fills = [{ type: 'SOLID', visible: true, color: { r: 13 / 255, g: 153 / 255, b: 1 }, opacity: 1 }];
    card.width = 240; card.paddingLeft = 16; card.itemSpacing = 12;
    eng.run('diffCache')[root.id] = null;
    const d = eng.ctx.diffBaseline(root);
    const c = d.changes.find(x => x.id === card.id);
    const get = p => c && (c.detail || []).find(x => x.prop === p);
    const want = [['Fill', '#FFFFFF', '#0D99FF'], ['Padding', '8 12 8 12', '8 12 8 16']];
    want.forEach(([p, b, a]) => { const x = get(p); if (!x || x.before !== b || x.after !== a) errs.push(p + ': ' + JSON.stringify(x)); });
    if (!get('Size') || !/→|240/.test(get('Size').after)) errs.push('size: ' + JSON.stringify(get('Size')));
    if (!get('Layout') || !/gap 8/.test(get('Layout').before) || !/gap 12/.test(get('Layout').after)) errs.push('gap: ' + JSON.stringify(get('Layout')));
    record('changes', 'before → after values for fill, size, padding and gap', errs, c ? c.detail.map(x => x.prop).join(', ') : 'no change found');
  }
  {
    const B = createBuilders(); const { root, st } = build(B, 10); const eng = loadEngine(B);
    const snap = eng.ctx.snapshot(root, 2500);
    Object.keys(snap).forEach(k => { if (Array.isArray(snap[k])) snap[k] = snap[k].slice(0, 4); }); // v1.0 format: no values
    st.set('devready', 'baseline', JSON.stringify(snap)); st.set('devready', 'baselineAt', '2026-01-01T00:00:00Z');
    const errs = [];
    let d = null;
    try { d = eng.ctx.diffBaseline(root); } catch (e) { errs.push('threw: ' + e.message); }
    if (!d) errs.push('legacy baseline not read');
    else if (d.count) errs.push('legacy baseline reports ' + d.count + ' changes');
    else if (d.values) errs.push('legacy baseline wrongly claims to have values');
    record('changes', 'reads baselines saved by older versions', errs);
  }
}

/* The TypeScript targets are more than a rename: typed props, .tsx, and ambient
   declarations so `tsc` accepts asset and CSS imports. Guard those specifics. */
async function typescriptTargets() {
  console.log('\nTypeScript targets' + C.d(' — typed props, .tsx, ambient asset declarations'));
  const gen = async (fixtureName, lang) => {
    const B = createBuilders();
    const fx = FIXTURES.find(f => f.name === fixtureName);
    const root = fx.build(B); root.parent = { type: 'PAGE', name: 'Page 1' };
    return loadEngine(B).generateCode(root, lang, 'px', 16, 600, {});
  };
  for (const lang of ['react-ts', 'react-tailwind-ts']) {
    const errs = [];
    const out = await gen('nested-components', lang);
    const file = out.files.find(f => /\.tsx$/.test(f.name));
    if (!file) errs.push('no .tsx file');
    else {
      const c = file.code;
      if (!/type StatCardProps = \{\n {2}label: string;\n {2}value: string;\n\};/.test(c)) errs.push('props type missing or untyped');
      if (!/function StatCard\(\{ label, value \}: StatCardProps\)/.test(c)) errs.push('component does not consume its props type');
      if (/\.jsx/.test(c)) errs.push('.jsx import left in TSX output');
    }
    record('typescript', lang, errs);
  }
  {
    // Assets must be declared, or `tsc` rejects the component.
    const errs = [];
    const out = await gen('images-and-icons', 'react-ts');
    const dts = out.files.find(f => f.name === 'assets.d.ts');
    if (!dts) errs.push('assets.d.ts missing when the design has assets');
    else ['css', 'svg', 'png'].forEach(e => { if (dts.code.indexOf("'*." + e + "'") < 0) errs.push('no declaration for *.' + e); });
    if (!out.files.some(f => /\.tsx$/.test(f.name))) errs.push('no .tsx file');
    record('typescript', 'ambient declarations cover every imported asset type', errs);
  }
  {
    // Parse-only checks (esbuild) miss type errors, so compile the real output.
    // A stub JSX namespace is enough: our own components are checked against their
    // generated Props types, which is what this feature promises.
    const errs = [];
    let ts = null;
    try { ts = require('typescript'); } catch (e) { /* optional dependency */ }
    if (!ts) errs.push('typescript is not installed — run npm ci');
    else {
      const os = require('os');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devready-ts-'));
      try {
        const out = await gen('nested-components', 'react-ts');
        out.files.forEach(f => fs.writeFileSync(path.join(dir, f.name), f.code));
        fs.writeFileSync(path.join(dir, 'jsx-stub.d.ts'), 'declare namespace JSX {\n  interface IntrinsicElements {\n    [elem: string]: any;\n  }\n}\n');
        const files = fs.readdirSync(dir).filter(f => /\.(ts|tsx)$/.test(f));
        const program = ts.createProgram(files.map(f => path.join(dir, f)), {
          noEmit: true, strict: true, jsx: ts.JsxEmit.Preserve, skipLibCheck: true,
          target: ts.ScriptTarget.ES2020, moduleResolution: ts.ModuleResolutionKind.Node10, types: []
        });
        ts.getPreEmitDiagnostics(program).forEach(d => {
          const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
          const where = d.file ? path.basename(d.file.fileName) + ':' + (d.file.getLineAndCharacterOfPosition(d.start).line + 1) : '';
          errs.push('tsc ' + where + ' — ' + msg);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    record('typescript', 'generated .tsx compiles with tsc (strict)', errs);
  }
  {
    // The JS targets must stay plain JS: no types, no .d.ts.
    const errs = [];
    const out = await gen('nested-components', 'react-css');
    const file = out.files.find(f => /\.jsx$/.test(f.name));
    if (!file) errs.push('no .jsx file');
    else if (/Props = \{|: StatCardProps/.test(file.code)) errs.push('types leaked into the JavaScript target');
    if (out.files.some(f => f.name === 'assets.d.ts')) errs.push('assets.d.ts emitted for a JavaScript target');
    record('typescript', 'JavaScript targets stay untyped', errs);
  }
}

function repoLayout() {
  console.log('\nrepository' + C.d(' — files are where GitHub, CI and Figma expect them'));
  const { checkLayout } = require('../scripts/check-layout.js');
  record('repo', 'layout: root files at the root, plugin folder contains only the plugin', checkLayout(path.join(__dirname, '..')));
}

async function messageValidation() {
  console.log('\nmessage validation' + C.d(' — UI → main thread boundary'));
  const B = createBuilders(); const eng = loadEngine(B);
  const v = m => eng.ctx.validateMsg(m);
  const cases = [
    ['unknown type is ignored', v({ type: 'eval-this', code: 'x' }) === null],
    ['non-object is ignored', v('settings') === null && v(null) === null],
    ['prototype keys are not types', v({ type: 'constructor' }) === null && v({ type: '__proto__' }) === null],
    ['settings: unknown keys dropped, bad values dropped', (() => { const r = v({ type: 'settings', settings: { gate: 'off', unit: 'em', remBase: 999, evil: 1, __proto__: { x: 1 } } }); return r && JSON.stringify(r.settings) === '{"gate":"off"}'; })()],
    ['export: format must be PNG/JPG/SVG/PDF', v({ type: 'export', id: '1:2', format: 'EXE', scale: 2 }).type === '__invalid'],
    ['export: scale clamped to 0.5–4', v({ type: 'export', id: '1:2', format: 'PNG', scale: 400 }).scale === 4],
    ['node id must look like a Figma id', v({ type: 'select', id: '1:2"><img>' }).type === '__invalid' && v({ type: 'select', id: 'I1:2;3:4' }).id === 'I1:2;3:4'],
    ['gen-code: language must be a known target', v({ type: 'gen-code', lang: 'php' }).type === '__invalid'],
    ['map-save: path cannot break out of the import string', v({ type: 'map-save', key: 'k1', name: 'Button', path: "x';alert(1);//" }).type === '__invalid'],
    ['map-save: valid path accepted', v({ type: 'map-save', key: 'k1', name: 'Button', path: '@/components/ui/button' }).path === '@/components/ui/button'],
    ['devres-add: only http(s) URLs', v({ type: 'devres-add', id: '1:2', url: 'javascript:alert(1)' }).type === '__invalid'],
    ['font-upload: size and type enforced', v({ type: 'font-upload', family: 'X', key: '0,400', ext: 'exe', bytes: new Uint8Array(4) }).type === '__invalid'],
    ['font-upload: storage key cannot be injected', v({ type: 'font-upload', family: 'X|font:Y', key: '0,400', ext: 'woff2', bytes: new Uint8Array(4) }).type === '__invalid'],
    ['export-all: invalid items dropped, list capped', (() => { const r = v({ type: 'export-all', items: [{ id: '1:2', format: 'PNG', scale: 2 }, { id: 'x"', format: 'PNG', scale: 2 }] }); return r.items.length === 1; })()],
    ['text fields truncated', v({ type: 'notify', text: 'x'.repeat(5000) }).text.length === 300]
  ];
  const errs = cases.filter(c => !c[1]).map(c => c[0]);
  record('messages', cases.length + ' schema cases (types, ranges, ids, injection)', errs);

  // Mappings stored in the file are re-validated on read and quoted on output
  {
    const B2 = createBuilders();
    const set = B2.SET('Button'); const main = B2.COMPONENT('Primary', set);
    const inst = B2.INST(main, {}, 'HORIZONTAL', { padding: '8px' }, [B2.T('Go', {})]);
    const root = B2.AL('Card', 'VERTICAL', { padding: '16px' }, [inst], { width: 200, height: 80 }); root.parent = { type: 'PAGE' };
    const eng2 = loadEngine(B2);
    const data = { ['map:' + set.key]: JSON.stringify({ name: 'Button', path: "./b';alert(1);//" }) };
    eng2.figma.root.getSharedPluginDataKeys = () => Object.keys(data);
    eng2.figma.root.getSharedPluginData = (ns, k) => data[k] || '';
    const e2 = [];
    let out = await eng2.generateCode(root, 'react-tailwind', 'px', 16, 600, {});
    if (/alert\(1\)/.test(out.files[0].code)) e2.push('crafted mapping path reached generated code');
    data['map:' + set.key] = JSON.stringify({ name: 'Button', path: '@/components/ui/button' });
    eng2.run('Object.keys(diffCache).forEach(k => delete diffCache[k])');
    out = await eng2.generateCode(root, 'react-tailwind', 'px', 16, 600, {});
    if (!/import \{ Button \} from '@\/components\/ui\/button';/.test(out.files[0].code)) e2.push('valid mapping not applied');
    record('messages', 'component mappings from the file are validated and safely quoted', e2);
  }
}

function sandboxCheck() {
  console.log('\nfigma sandbox');
  const errs = [];
  [['import(', /\bimport\s*\(/], ['eval(', /\beval\s*\(/], ['<!--', /<!--/], ['-->', /-->/]].forEach(([label, re]) => { if (re.test(CODE)) errs.push('code.js contains "' + label + '" which Figma\'s SES sandbox rejects'); });
  record('sandbox', 'code.js passes Figma SES source checks', errs);
}

(async () => {
  console.log('DevReady test suite');
  sandboxCheck();
  for (const fx of FIXTURES) if (!only || fx.name.includes(only)) await runFixture(fx);
  if (!only) { await changeTracking(); await privacyAndOffline(); await messageValidation(); await require('./features')(record); await typescriptTargets(); repoLayout(); }
  const total = results.length;
  console.log('\n' + (failed ? C.r(failed + ' failed') : C.g('all passed')) + ' · ' + (total - failed) + '/' + total + ' checks');
  if (REPORT) {
    const groups = [...new Set(results.map(r => r.group))];
    let md = '# Test report\n\nGenerated by `npm test -- --report` on ' + new Date().toISOString().slice(0, 10) + '. ' + (total - failed) + '/' + total + ' checks passed.\n\n';
    md += '| Fixture | ' + LANGS.join(' | ') + ' |\n|---|' + LANGS.map(() => ':-:').join('|') + '|\n';
    FIXTURES.forEach(fx => { const row = LANGS.map(l => { const r = results.find(x => x.group === fx.name && x.name === l); return r ? (r.ok ? '✅' : '❌') : '–'; }); md += '| `' + fx.name + '` — ' + fx.about + ' | ' + row.join(' | ') + ' |\n'; });
    md += '\n## Other checks\n\n';
    results.filter(r => !LANGS.includes(r.name)).forEach(r => { md += '- ' + (r.ok ? '✅' : '❌') + ' ' + r.name + (r.extra ? ' (' + r.extra + ')' : '') + '\n'; });
    md += '\nWhat "valid" means per language: JSX/TSX is parsed by esbuild; CSS by esbuild plus comment/brace checks; HTML is checked for injected markup, balanced `<style>` and well-formed tags; Swift, Kotlin and Dart are checked for balanced brackets and safe string literals (escapes, `\\(` and `$` templates), and Vue/Svelte for escaped template expressions. Swift, Kotlin and Dart are **not compiled** in CI.\n';
    md += '\nBrowser checks (`npm run test:browser`: panel render in light/dark, preview sandbox against a hostile document, online and offline) run as a separate CI job.\n';
    void groups;
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'test-report.md'), md);
    console.log('wrote docs/test-report.md');
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(C.r('test runner crashed: ') + (e && e.stack || e)); process.exit(1); });
