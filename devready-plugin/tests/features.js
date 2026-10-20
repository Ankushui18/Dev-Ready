/**
 * Tests for v1.2 features: accessibility audit, design-token export and the
 * extra code targets' template-injection guards.
 */
'use strict';
const { createBuilders, loadEngine } = require('./harness');
const { V } = require('./validators');

const hex = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const solid = (h, opacity) => ({ type: 'SOLID', visible: true, color: hex(h), opacity: opacity === undefined ? 1 : opacity });

module.exports = async function featureTests(record) {
  /* ---------------- accessibility ---------------- */
  console.log('\naccessibility audit — WCAG contrast, touch targets, labels');
  const audit = (build) => {
    const B = createBuilders();
    const root = build(B);
    root.parent = { type: 'PAGE', name: 'Page 1' };
    const eng = loadEngine(B);
    return eng.ctx.a11yAudit(root, 400);
  };
  const frame = (B, w, fillHex, kids, extra) => B.N(Object.assign({ type: 'FRAME', name: 'Screen', width: w, height: 600, layoutMode: 'NONE', fills: fillHex ? [solid(fillHex)] : [] }, extra), kids);
  const textItem = (r, i) => r.items.filter(x => x.kind === 'contrast')[i || 0];
  {
    const errs = [];
    const run = (fg, bg, css, extra) => textItem(audit(B => frame(B, 400, bg, [B.T('Sample text', css || {}, Object.assign({ fills: [solid(fg)] }, extra))])));
    const a = run('#000000', '#FFFFFF'); if (!a || a.ratio !== 21 || a.status !== 'pass') errs.push('black on white: ' + JSON.stringify(a));
    const b = run('#777777', '#FFFFFF'); if (!b || b.status !== 'fail' || b.ratio < 4.4 || b.ratio > 4.5) errs.push('#777 on white should fail AA (4.48): ' + JSON.stringify(b));
    const c = run('#767676', '#FFFFFF'); if (!c || c.status !== 'pass') errs.push('#767676 on white should pass AA (4.54): ' + JSON.stringify(c));
    const d = run('#888888', '#FFFFFF', { 'font-size': '14px' }); if (!d || d.status !== 'fail') errs.push('#888 at 14px should fail');
    const e = run('#888888', '#FFFFFF', { 'font-size': '28px', 'font-weight': '400' }); if (!e || e.status !== 'pass' || !e.large) errs.push('#888 at 28px is large text and should pass 3:1: ' + JSON.stringify(e));
    const g = run('#000000', '#FFFFFF', {}, { opacity: 0.3 }); if (!g || g.status !== 'fail') errs.push('30% opacity black text should fail: ' + JSON.stringify(g));
    record('a11y', 'contrast ratios match WCAG (21:1, 4.48 fail, 4.54 pass, large-text 3:1, opacity)', errs);
  }
  {
    const errs = [];
    // text on a dark rectangle that sits below it in the same frame (frame itself has no fill)
    const r = audit(B => {
      const rect = B.R('bg', 400, 600, {}, { fills: [solid('#111827')] });
      const white = B.T('Readable', {}, { fills: [solid('#FFFFFF')] });
      const dark = B.T('Hidden', {}, { fills: [solid('#222222')] });
      return frame(B, 400, null, [rect, white, dark]);
    });
    const t1 = r.items.find(x => x.name === 'Readable'), t2 = r.items.find(x => x.name === 'Hidden');
    if (!t1 || t1.status !== 'pass') errs.push('white on dark rectangle should pass: ' + JSON.stringify(t1));
    if (!t2 || t2.status !== 'fail') errs.push('#222 on #111827 should fail: ' + JSON.stringify(t2));
    // no fill anywhere: assume white and say so
    const r2 = audit(B => frame(B, 400, null, [B.T('Floating', {}, { fills: [solid('#000000')] })]));
    if (!textItem(r2) || !textItem(r2).assumed) errs.push('missing background should be flagged as assumed white');
    // gradient background cannot be measured
    const r3 = audit(B => frame(B, 400, null, [B.T('On gradient', {}, { fills: [solid('#FFFFFF')] })], { fills: [{ type: 'GRADIENT_LINEAR', visible: true }] }));
    if (!textItem(r3) || textItem(r3).status !== 'unknown') errs.push('gradient background should be reported as unknown');
    record('a11y', 'background is found from covering siblings, ancestors, assumed white, or flagged unknown', errs);
  }
  {
    const errs = [];
    const btn = (B, name, s, kids) => B.N({ type: 'FRAME', name, width: s, height: s, layoutMode: 'HORIZONTAL' }, kids);
    const r = audit(B => frame(B, 375, '#FFFFFF', [
      btn(B, 'Button / small', 20, [B.T('x', {}, { fills: [solid('#000000')] })]),
      btn(B, 'Button / medium', 36, [B.T('Go', {}, { fills: [solid('#000000')] })]),
      btn(B, 'Button / large', 48, [B.T('Pay', {}, { fills: [solid('#000000')] })]),
      btn(B, 'Icon button', 44, [B.ICON('icon', 20)])
    ]));
    const by = n => r.items.filter(x => x.kind === 'target' && x.name === n)[0];
    if (!by('Button / small') || by('Button / small').status !== 'fail') errs.push('20px target should fail (<24)');
    if (!by('Button / medium') || by('Button / medium').status !== 'warn') errs.push('36px target on mobile should warn (<44)');
    if (!by('Button / large') || by('Button / large').status !== 'pass') errs.push('48px target should pass');
    if (!r.items.some(x => x.kind === 'label' && x.name === 'Icon button')) errs.push('icon-only button should get a missing-label warning');
    const desk = audit(B => frame(B, 1440, '#FFFFFF', [btn(B, 'Button / small', 32, [B.T('Go', {}, { fills: [solid('#000000')] })])]));
    const dt = desk.items.filter(x => x.kind === 'target')[0];
    if (!dt || dt.status !== 'pass') errs.push('32px target on a desktop frame should pass (44px warning is touch-only)');
    if (r.counts.fail < 1 || r.counts.warn < 2) errs.push('counts wrong: ' + JSON.stringify(r.counts));
    record('a11y', 'touch targets (24px fail, 44px mobile warn) and icon-only labels', errs);
  }

  /* ---------------- design tokens ---------------- */
  console.log('\ndesign tokens — CSS, SCSS, JSON (DTCG), Tailwind v4');
  const tokenWorld = () => {
    const B = createBuilders();
    const theme = B.COLLECTION('Theme', ['Light', 'Dark']);
    const density = B.COLLECTION('Density', ['Comfortable', 'Compact']);
    const blue = B.VAR(theme, 'blue/500', 'COLOR', { Light: { r: 0.05, g: 0.6, b: 1, a: 1 }, Dark: { r: 0.24, g: 0.68, b: 1, a: 1 } }, 'var(--blue-500)');
    const primary = B.VAR(theme, 'color/brand/primary', 'COLOR', { Light: blue, Dark: { r: 0.9, g: 0.9, b: 0.9, a: 1 } });
    const space = B.VAR(density, 'spacing/400', 'FLOAT', { Comfortable: 16, Compact: 12 });
    const opacity = B.VAR(density, 'opacity/muted', 'FLOAT', { Comfortable: 0.6, Compact: 0.6 });
    const font = B.VAR(theme, 'font/family/body', 'STRING', { Light: 'Inter', Dark: 'Inter' });
    // hostile names must stay inert
    B.VAR(theme, 'evil/__proto__/polluted', 'COLOR', { Light: { r: 0, g: 0, b: 0, a: 1 }, Dark: { r: 0, g: 0, b: 0, a: 1 } }, 'var(--x);}</style><script>alert(1)</script>{');
    B.VAR(theme, 'x;}body{display:none}/*', 'COLOR', { Light: { r: 1, g: 0, b: 0, a: 1 }, Dark: { r: 1, g: 0, b: 0, a: 1 } });
    B.VAR(theme, 'quote"\\name', 'STRING', { Light: 'a"b\\c\nd', Dark: 'e' });
    void primary; void space; void opacity; void font;
    return B;
  };
  const build = async (format, scope, node, unit, opts) => {
    const B = tokenWorld();
    const eng = loadEngine(B, opts);
    return { out: await eng.ctx.buildTokens(format, scope, node || null, unit || 'px', 16), B, eng };
  };
  {
    const errs = [];
    const { out } = await build('css', 'file');
    const t = out.text;
    if (!/:root \{[\s\S]*--blue-500: #0D99FF;/.test(t)) errs.push('missing --blue-500 default');
    if (!/--color-brand-primary: var\(--blue-500\);/.test(t)) errs.push('alias should reference var(--blue-500)');
    if (!/\[data-theme="dark"\] \{[\s\S]*--blue-500: #3DADFF;/.test(t)) errs.push('missing dark-mode override block');
    if (!/--spacing-400: 16px;/.test(t) || !/\[data-density="compact"\] \{[\s\S]*--spacing-400: 12px;/.test(t)) errs.push('density mode override missing');
    if (!/--opacity-muted: 0\.6;/.test(t)) errs.push('opacity must stay unitless');
    if (/<script|<\/style>|body\{display|display:none/.test(t)) errs.push('hostile names/code-syntax reached the CSS');
    V.css(t).forEach(e => errs.push('CSS invalid: ' + e));
    if (out.stats.variables !== 8 || out.stats.modes < 2) errs.push('stats: ' + JSON.stringify(out.stats));
    record('tokens', 'CSS: :root, alias → var(), per-mode overrides, unitless values, hostile names inert', errs, out.stats.variables + ' variables');
  }
  {
    const errs = [];
    const { out } = await build('css', 'file', null, 'rem');
    if (!/--spacing-400: 1rem;/.test(out.text)) errs.push('rem unit not applied to spacing');
    const sc = (await build('scss', 'file')).out.text;
    if (!/\$blue-500: #0D99FF;/.test(sc) || !/\$blue-500--dark: #3DADFF;/.test(sc)) errs.push('SCSS defaults/mode variables missing');
    if (!/\$color-brand-primary: \$blue-500;/.test(sc)) errs.push('SCSS alias should reference $blue-500: ' + sc.split('\n').filter(l => /brand-primary/.test(l)).join(' | '));
    if (/<script|body\{/.test(sc)) errs.push('hostile data reached SCSS');
    record('tokens', 'rem conversion and SCSS variables with aliases and per-mode variants', errs);
  }
  {
    const errs = [];
    const { out } = await build('json', 'file');
    let j; try { j = JSON.parse(out.text); } catch (e) { errs.push('invalid JSON: ' + e.message); }
    if (j) {
      const p = j.color && j.color.brand && j.color.brand.primary;
      if (!p || p.$type !== 'color' || p.$value !== '{blue.500}') errs.push('alias should be {blue.500}: ' + JSON.stringify(p));
      if (!p || !p.$extensions || !p.$extensions['com.figma'].modes || !p.$extensions['com.figma'].modes.Dark) errs.push('dark mode value missing from $extensions');
      const s = j.spacing && j.spacing['400']; if (!s || s.$type !== 'dimension' || s.$value !== '16px') errs.push('spacing token wrong: ' + JSON.stringify(s));
      if (({}).polluted !== undefined || Object.prototype.polluted !== undefined) errs.push('prototype pollution via variable name');
    }
    record('tokens', 'JSON (design-tokens format): types, {alias} references, mode extensions, no prototype pollution', errs);
  }
  {
    const errs = [];
    const { out } = await build('tailwind', 'file');
    const t = out.text;
    if (!/@import "tailwindcss";/.test(t) || !/@theme \{/.test(t)) errs.push('missing @theme block');
    if (!/--color-brand-primary: var\(--color-blue-500\);/.test(t)) errs.push('alias not mapped to --color-blue-500: ' + t.split('\n').filter(l => /brand-primary/.test(l)).join(' | '));
    if (!/--spacing-400: 16px;/.test(t)) errs.push('spacing should map to --spacing-*');
    if (!/\[data-theme="dark"\] \{[\s\S]*--color-blue-500: #3DADFF;/.test(t)) errs.push('dark override missing');
    record('tokens', 'Tailwind v4 @theme: --color-*, --spacing-*, mode overrides', errs);
  }
  {
    const errs = [];
    const B = tokenWorld();
    const only = B.R('Box', 10, 10, {}, { boundVariables: { width: { id: Object.keys(B.VARS).find(k => B.VARS[k].name === 'spacing/400') } } });
    only.parent = { type: 'PAGE' };
    const eng = loadEngine(B);
    const out = await eng.ctx.buildTokens('css', 'selection', only, 'px', 16);
    if (out.stats.variables !== 1 || !/--spacing-400/.test(out.text) || /--blue-500/.test(out.text)) errs.push('selection scope should include only variables used by the layer: ' + JSON.stringify(out.stats));
    const B2 = createBuilders();
    const none = await loadEngine(B2).ctx.buildTokens('css', 'file', null, 'px', 16);
    if (!none.empty) errs.push('empty file should report empty');
    // styles
    const eng3 = loadEngine(B2, {
      paintStyles: [{ name: 'Brand/Primary', paints: [solid('#0D99FF')] }],
      textStyles: [{ name: 'Heading/H1', fontName: { family: 'Inter', style: 'Bold' }, fontSize: 32, lineHeight: { unit: 'PIXELS', value: 40 }, letterSpacing: { unit: 'PERCENT', value: 0 } }]
    });
    const st = await eng3.ctx.buildTokens('css', 'file', null, 'px', 16);
    if (!/--style-brand-primary: #0D99FF;/.test(st.text) || !/--text-heading-h1-font-size: 32px;/.test(st.text) || !/--text-heading-h1-font-weight: 700;/.test(st.text)) errs.push('paint/text styles missing from CSS: ' + st.text);
    const stj = JSON.parse((await eng3.ctx.buildTokens('json', 'file', null, 'px', 16)).text);
    if (!stj.text || !stj.text.Heading.H1.$value || stj.text.Heading.H1.$type !== 'typography') errs.push('typography style missing from JSON');
    record('tokens', 'selection scope, empty file, and paint/text styles', errs);
  }
  {
    const errs = [];
    const v = m => loadEngine(createBuilders()).ctx.validateMsg(m);
    if (v({ type: 'tokens-export', format: 'css', scope: 'file' }).format !== 'css') errs.push('valid request rejected');
    if (v({ type: 'tokens-export', format: 'php', scope: 'file' }).type !== '__invalid') errs.push('unknown format accepted');
    if (v({ type: 'tokens-export', format: 'css', scope: 'everything' }).type !== '__invalid') errs.push('unknown scope accepted');
    if (v({ type: 'gen-code', lang: 'flutter' }).lang !== 'flutter' || v({ type: 'gen-code', lang: 'vue' }).lang !== 'vue') errs.push('new languages not accepted by gen-code');
    record('tokens', 'tokens-export and new language ids pass message validation', errs);
  }
};
