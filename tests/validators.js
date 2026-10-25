/**
 * Language-level checks for generated code. They are deliberately dependency-light:
 *  - JSX/TSX  → parsed by esbuild (real parser)
 *  - CSS      → comment/brace/declaration structure
 *  - HTML     → no executable markup from design data, balanced <style>, valid attributes
 *  - Swift    → string-literal escapes + balanced brackets
 *  - Kotlin   → string-literal escapes (incl. `$` templates) + balanced brackets
 *  - Vue / Svelte → HTML checks + no template expressions ({{ }} / { }) from design data
 *  - Dart     → single-quoted literal escapes (incl. `$` interpolation) + balanced brackets
 */
'use strict';
let esbuild = null;
try { esbuild = require('esbuild'); } catch (e) { /* optional */ }

function balanced(code, opts) {
  // Walk the source skipping strings and comments; check (), {}, [] balance.
  const pairs = { ')': '(', '}': '{', ']': '[' }, stack = [];
  const q = (opts && opts.quote) || '"';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = code.indexOf('*/', i + 2); if (e < 0) return 'unterminated block comment'; i = e + 2; continue; }
    if (c === q) {
      if (q === '"' && opts && opts.triple && code.startsWith('"""', i)) { const e = code.indexOf('"""', i + 3); if (e < 0) return 'unterminated """'; i = e + 3; continue; }
      i++;
      while (i < n && code[i] !== q) { if (code[i] === '\\') i++; if (code[i] === '\n') return 'newline inside string at ' + i; i++; }
      if (i >= n) return 'unterminated string';
      i++; continue;
    }
    if ('({['.includes(c)) stack.push(c);
    else if (')}]'.includes(c)) { if (stack.pop() !== pairs[c]) return 'unbalanced ' + c + ' at offset ' + i + ' near: ' + JSON.stringify(code.slice(Math.max(0, i - 40), i + 10)); }
    i++;
  }
  return stack.length ? 'unclosed ' + stack.join('') : null;
}

function stringLiterals(code) {
  const out = [];
  const re = /"(?:[^"\\\n]|\\.)*"/g;
  let m;
  // skip // comments
  code.split('\n').forEach(line => {
    const cut = line.replace(/^\s*\/\/.*$/, '');
    while ((m = re.exec(cut))) out.push(m[0]);
  });
  return out;
}

/** All escape sequences in a string-literal body, consuming \\ pairs correctly. */
function escapes(body) {
  const out = [], re = /\\(u\{[^}]*\}|u[0-9A-Fa-f]{4}|[\s\S])/g;
  let m;
  while ((m = re.exec(body))) out.push(m[0]);
  return out;
}

/** Dart single-quoted string literals, ignoring // comments. */
function dartLiterals(code) {
  const out = [], re = /'(?:[^'\\\n]|\\.)*'/g;
  let m;
  code.split('\n').forEach(line => { const cut = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''); while ((m = re.exec(cut))) out.push(m[0]); });
  return out;
}

const V = {
  common(code) {
    const errs = [];
    if (/\bundefined\b/.test(code.replace(/(['"])(?:(?!\1)[^\\]|\\.)*\1/g, ''))) errs.push('contains bare "undefined"');
    if (/\bNaN\b/.test(code)) errs.push('contains NaN');
    if (code.includes('[object Object]')) errs.push('contains [object Object]');
    return errs;
  },

  jsx(code, file) {
    if (!esbuild) return ['esbuild not installed — run npm install'];
    try { esbuild.transformSync(code, { loader: /\.tsx$/.test(file) ? 'tsx' : 'jsx', jsx: 'preserve', logLevel: 'silent' }); return []; }
    catch (e) { return ['JSX parse error: ' + (e.errors && e.errors[0] ? e.errors[0].text + ' (line ' + (e.errors[0].location || {}).line + ')' : e.message)]; }
  },

  css(code) {
    const errs = [];
    const noComments = code.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\/\*|\*\//.test(noComments)) errs.push('broken CSS comment (layer name containing */ ?)');
    const noStrings = noComments.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    let depth = 0;
    for (const ch of noStrings) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth < 0) { errs.push('extra }'); break; } } }
    if (depth > 0) errs.push('unclosed {');
    if (/<\/?(script|style)\b/i.test(noComments)) errs.push('markup inside CSS');
    if (/url\(\s*<path-to-image>\s*\)/i.test(noComments)) errs.push('unresolved Figma image-fill placeholder');
    if (esbuild) {
      try { esbuild.transformSync(code, { loader: 'css', logLevel: 'silent' }); }
      catch (e) { errs.push('CSS parse error: ' + (e.errors && e.errors[0] ? e.errors[0].text : e.message)); }
    }
    return errs;
  },

  html(code) {
    const errs = [];
    if (/<script\b/i.test(code)) errs.push('<script> tag in generated HTML');
    // every <style> must close exactly once, and nothing inside may close it early
    const opens = (code.match(/<style\b/gi) || []).length, closes = (code.match(/<\/style>/gi) || []).length;
    if (opens !== closes) errs.push('unbalanced <style> (' + opens + ' open, ' + closes + ' close)');
    // HTML comments must not be closed early by design data
    const cm = code.match(/<!--[\s\S]*?-->/g) || [];
    cm.forEach(c => { if (/--(?!>$)/.test(c.slice(4, -3)) && /-->/.test(c.slice(4, -3))) errs.push('HTML comment broken by content'); });
    // tags: attribute syntax must be well-formed (no stray quotes or '<' from design data)
    const body = code.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'=<>\/`]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
    const stripped = body.replace(tagRe, '').replace(/<\/[a-zA-Z][\w-]*\s*>/g, '').replace(/<!DOCTYPE html>/i, '');
    const stray = stripped.match(/<[a-zA-Z\/!][^<]{0,60}/);
    if (stray) errs.push('malformed tag or unescaped "<" in text: ' + JSON.stringify(stray[0]));
    let m;
    while ((m = tagRe.exec(body))) { if (/\son[a-z]+\s*=/i.test(m[2].replace(/"[^"]*"|'[^']*'/g, '""'))) errs.push('event-handler attribute in <' + m[1] + '>: ' + m[2].slice(0, 80)); }
    // embedded CSS
    (code.match(/<style>([\s\S]*?)<\/style>/gi) || []).forEach(s => V.css(s.replace(/<\/?style>/gi, '')).forEach(e => errs.push('inline CSS: ' + e)));
    return errs;
  },

  swift(code) {
    const errs = [];
    const b = balanced(code, { triple: true }); if (b) errs.push(b);
    stringLiterals(code).forEach(s => {
      const body = s.slice(1, -1);
      escapes(body).forEach(e => {
        if (e === '\\(') errs.push('Swift string interpolation from design data: ' + s.slice(0, 60));
        else if (!/^\\([\\"'nrt0]|u\{[0-9A-Fa-f]{1,8}\})$/.test(e)) errs.push('invalid Swift escape ' + e + ' in ' + s.slice(0, 60));
      });
    });
    return errs;
  },

  vue(code) {
    const errs = V.html(code.replace(/<template>|<\/template>/g, ''));
    const tpl = (/<template>([\s\S]*?)<\/template>/.exec(code) || [])[1] || '';
    if (!/<template>/.test(code)) errs.push('missing <template>');
    if (/\{\{/.test(tpl)) errs.push('Vue interpolation {{ from design data in template');
    return errs;
  },

  svelte(code) {
    const errs = V.html(code);
    const markup = code.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    if (/[{}]/.test(markup)) errs.push('Svelte expression braces from design data in markup: ' + JSON.stringify((/.{0,30}[{}].{0,30}/.exec(markup) || [''])[0]));
    return errs;
  },

  dart(code) {
    const errs = [];
    const b = balanced(code, { quote: "'" }); if (b) errs.push(b);
    dartLiterals(code).forEach(s => {
      const body = s.slice(1, -1);
      escapes(body).forEach(e => { if (!/^\\([\\'nrt$]|u\{[0-9A-Fa-f]{1,6}\})$/.test(e)) errs.push('invalid Dart escape ' + e + ' in ' + s.slice(0, 60)); });
      if (/\$/.test(body.replace(/\\./g, ''))) errs.push('unescaped Dart interpolation ($) in ' + s.slice(0, 60));
    });
    return errs;
  },

  kotlin(code) {
    const errs = [];
    const b = balanced(code, { triple: true }); if (b) errs.push(b);
    stringLiterals(code).forEach(s => {
      const body = s.slice(1, -1);
      escapes(body).forEach(e => { if (!/^\\([\\"'nrtb$]|u[0-9A-Fa-f]{4})$/.test(e)) errs.push('invalid Kotlin escape ' + e + ' in ' + s.slice(0, 60)); });
      if (/\$[A-Za-z_{]/.test(body.replace(/\\./g, ''))) errs.push('unescaped Kotlin template ($) in ' + s.slice(0, 60));
    });
    return errs;
  }
};

function validateFile(f) {
  const errs = V.common(f.code);
  const name = f.name || '';
  if (/\.(jsx|tsx)$/.test(name) || f.lang === 'jsx' || f.lang === 'tsx') errs.push(...V.jsx(f.code, name.endsWith('.tsx') ? name : 'x.jsx'));
  else if (/\.css$/.test(name) || f.lang === 'css') errs.push(...V.css(f.code));
  else if (/\.vue$/.test(name) || f.lang === 'vue') errs.push(...V.vue(f.code));
  else if (/\.svelte$/.test(name) || f.lang === 'svelte') errs.push(...V.svelte(f.code));
  else if (/\.dart$/.test(name) || f.lang === 'dart') errs.push(...V.dart(f.code));
  else if (/\.html?$/.test(name) || f.lang === 'html') errs.push(...V.html(f.code));
  else if (/\.swift$/.test(name) || f.lang === 'swift') errs.push(...V.swift(f.code));
  else if (/\.kt$/.test(name) || f.lang === 'kotlin') errs.push(...V.kotlin(f.code));
  return errs;
}

module.exports = { validateFile, V, balanced };
