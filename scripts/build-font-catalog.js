#!/usr/bin/env node
/**
 * Rebuilds the bundled Google Fonts catalog (`GF_DATA` in devready-plugin/code.js).
 *
 *   npm i --no-save google-font-metadata@6
 *   node scripts/build-font-catalog.js            # prints what it would change
 *   node scripts/build-font-catalog.js --write    # rewrites GF_DATA in code.js
 *
 * The plugin needs the catalog to decide "is this family on Google Fonts, and
 * which weights/italics can I link?" without a request, so confidential font
 * names in a Figma file never leave the machine. See PRIVACY.md.
 *
 * Wire format (parsed by `gfLookup` in code.js), one family per ';':
 *
 *   Family name | category | weights | wghtMin-wghtMax
 *
 *   category     s sans · r serif · m mono · d display · h handwriting
 *   weights      base-36 bitmask; bits 0-8 = 100..900 upright,
 *                bits 9-17 = 100..900 italic
 *   wght range   optional; present for variable fonts, where any weight in the
 *                range can be requested (e.g. Space Grotesk 450)
 *
 * Nothing from the package ships: only the generated string is committed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CODE = path.join(__dirname, '..', 'devready-plugin', 'code.js');
const WRITE = process.argv.includes('--write');
const FROM = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || 'google-font-metadata';

const CATEGORY = { 'sans-serif': 's', serif: 'r', monospace: 'm', display: 'd', handwriting: 'h' };

function load(what) {
  try { return require(FROM + '/data/' + what); } catch (e) {
    console.error('Could not load ' + FROM + '/data/' + what + ' (' + e.message + ').\n' +
      'Install it first: npm i --no-save google-font-metadata@6');
    process.exit(1);
  }
}

function bitmask(weights, italic) {
  let mask = 0;
  weights.forEach(w => {
    const i = Math.round(w / 100) - 1;
    if (i < 0 || i > 8) return;
    mask |= 1 << i;                      // upright cut
    if (italic) mask |= 1 << (i + 9);    // italic cut of the same weight
  });
  return mask.toString(36);
}

function buildRows(fonts, variable) {
  const axes = {};
  (Array.isArray(variable) ? variable : Object.values(variable)).forEach(f => {
    const a = f.axes && f.axes.wght;
    if (a) axes[String(f.family || '').toLowerCase()] = [Number(a.min), Number(a.max)];
  });
  return Object.keys(fonts).map(k => fonts[k])
    .sort((a, b) => a.family.localeCompare(b.family))
    .map(f => {
      const name = String(f.family).replace(/[|;]/g, ' ').trim();
      const weights = (f.weights || [400]).map(Number);
      const italic = (f.styles || []).indexOf('italic') > -1;
      const mask = bitmask(weights, italic);
      const r = axes[String(f.family).toLowerCase()];
      return name + '|' + (CATEGORY[f.category] || 's') + '|' + mask + (r ? '|' + r[0] + '-' + r[1] : '');
    });
}

function decode(row) {
  const p = String(row).split('|');
  const mask = parseInt(p[2], 36) || 0;
  const out = [];
  for (let i = 0; i < 18; i++) if ((mask >> i) & 1) out.push((i > 8 ? 'i' : '') + ((i % 9) + 1) * 100);
  return out.join(',');
}

function main() {
  const rows = buildRows(load('google-fonts-v2.json'), load('variable-response.json'));
  const data = rows.join(';');
  const code = fs.readFileSync(CODE, 'utf8');
  const re = /const GF_DATA = '[^']*';/;
  const found = re.exec(code);
  if (!found) { console.error('GF_DATA not found in ' + CODE); process.exit(1); }

  const current = found[0].slice(16, -2).split(';');
  console.log('current catalog : ' + current.length + ' families');
  console.log('package builds  : ' + rows.length + ' families (' + Math.round(data.length / 1024) + ' kB)');

  // Report what changes, so a refresh is never a silent downgrade.
  const cur = {}; current.forEach(r => { cur[r.split('|')[0].toLowerCase()] = r; });
  const next = {}; rows.forEach(r => { next[r.split('|')[0].toLowerCase()] = r; });
  const added = Object.keys(next).filter(k => !cur[k]);
  const removed = Object.keys(cur).filter(k => !next[k]);
  const changed = Object.keys(next).filter(k => cur[k] && cur[k] !== next[k]);
  console.log('added ' + added.length + ', removed ' + removed.length + ', changed ' + changed.length);
  changed.slice(0, 10).forEach(k => {
    console.log('  ~ ' + next[k].split('|')[0] + ': [' + decode(cur[k]) + '] → [' + decode(next[k]) + ']');
  });
  if (removed.length > 10) console.log('  (' + (removed.length - 10) + ' more removals not shown)');

  if (!WRITE) { console.log('\nDry run. Re-run with --write to update code.js.'); return; }
  fs.writeFileSync(CODE, code.replace(re, "const GF_DATA = '" + data.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "';"));
  console.log('\nWrote GF_DATA to ' + path.relative(process.cwd(), CODE) + '. Run `npm run verify`.');
}

main();
