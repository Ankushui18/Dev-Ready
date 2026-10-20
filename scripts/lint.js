#!/usr/bin/env node
/* Lints the plugin, the tests and the tooling with ESLint. The UI script lives inside
   ui.html, so it is extracted and linted under the virtual name ui.html.js (line
   numbers match ui.html). Exit code 1 on any error. */
'use strict';
const fs = require('fs');
const path = require('path');
const { ESLint } = require('eslint');

(async () => {
  const root = path.join(__dirname, '..');
  const fix = process.argv.includes('--fix');
  const eslint = new ESLint({ cwd: root, fix });
  const results = await eslint.lintFiles(['devready-plugin/code.js', 'devready-plugin/check-sandbox.js', 'tests', 'scripts', 'eslint.config.js']);

  if (fix) await ESLint.outputFixes(results);
  const htmlPath = path.join(root, 'devready-plugin/ui.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const fixedHtml = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    // pad with newlines so reported line numbers point at ui.html
    const pad = '\n'.repeat(html.slice(0, m.index + '<script>'.length).split('\n').length - 1);
    const r = await eslint.lintText(pad + m[1], { filePath: path.join(root, 'devready-plugin/ui.html.js') });
    r.forEach(x => { x.filePath = htmlPath; if (fix && x.output) fixedHtml.push([m.index + '<script>'.length, m[1], x.output.slice(pad.length)]); });
    results.push(...r);
  }
  // write fixes back into ui.html (last script first so offsets stay valid)
  fixedHtml.reverse().forEach(([at, before, after]) => { html = html.slice(0, at) + after + html.slice(at + before.length); });
  if (fixedHtml.length) fs.writeFileSync(htmlPath, html);
  const fmt = await eslint.loadFormatter('stylish');
  const out = fmt.format(results);
  const errors = results.reduce((a, r) => a + r.errorCount, 0);
  const files = results.length;
  if (out) console.log(out);
  console.log(errors ? errors + ' lint error(s)' : 'lint OK — ' + files + ' files');
  process.exit(errors ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
