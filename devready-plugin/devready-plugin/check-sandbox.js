// Run: node check-sandbox.js — flags source text Figma's plugin sandbox (SES) rejects, even inside strings/comments.
const src = require('fs').readFileSync(__dirname + '/code.js', 'utf8').split('\n');
const rules = [[/(^|[^.]|\.\.\.)\bimport(\s*(?:\(|\/[/*]))/, 'looks like import(...)'], [/<!--|-->/, 'HTML comment token'], [/(^|[^.]|\.\.\.)\beval(\s*\()/, 'direct eval(...)']];
let bad = 0;
src.forEach((l, i) => rules.forEach(([re, why]) => { if (re.test(l)) { bad++; console.log('code.js:' + (i + 1) + '  ' + why + '\n    ' + l.trim().slice(0, 120)); } }));
console.log(bad ? bad + ' problem(s) — Figma will refuse to load the plugin' : 'OK — safe for the Figma sandbox');
process.exit(bad ? 1 : 0);
