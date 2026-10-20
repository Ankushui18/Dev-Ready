#!/usr/bin/env node
/* Verifies the repository layout, so a mis-placed upload (e.g. root files dragged into
   devready-plugin/ via the GitHub web UI, or hidden folders like .github dropped) is
   caught immediately. Run: npm run check:layout (also part of npm test). */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const REQUIRED = ['README.md', 'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'package.json', 'package-lock.json',
  '.gitignore', '.github/workflows/ci.yml', 'tests/run.js', 'tests/harness.js', 'tests/fixtures.js', 'tests/validators.js', 'tests/browser.py',
  'scripts/zip.js', 'scripts/lint.js', 'eslint.config.js', 'docs/test-report.md',
  'devready-plugin/manifest.json', 'devready-plugin/code.js', 'devready-plugin/ui.html', 'devready-plugin/check-sandbox.js'];
// Things that belong at the repo root, not inside the plugin folder Figma imports.
const NOT_IN_PLUGIN = ['docs', 'tests', 'scripts', '.github', 'package.json', 'package-lock.json', 'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'node_modules'];

function checkLayout(dir) {
  const problems = [];
  REQUIRED.forEach(p => { if (!fs.existsSync(path.join(dir, p))) problems.push('missing ' + p); });
  NOT_IN_PLUGIN.forEach(p => { if (fs.existsSync(path.join(dir, 'devready-plugin', p))) problems.push('devready-plugin/' + p + ' should be at the repository root'); });
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'devready-plugin/manifest.json'), 'utf8'));
    ['main', 'ui'].forEach(k => { if (m[k] && !fs.existsSync(path.join(dir, 'devready-plugin', m[k]))) problems.push('manifest.' + k + ' points to a missing file: ' + m[k]); });
  } catch (e) { problems.push('manifest.json is not valid JSON: ' + e.message); }
  return problems;
}
module.exports = { checkLayout };

if (require.main === module) {
  const p = checkLayout(root);
  if (p.length) { console.error('Repository layout problems:\n  - ' + p.join('\n  - ') + '\nSee docs/GITHUB_SETUP.md → "Fixing a mis-placed upload".'); process.exit(1); }
  console.log('layout OK — ' + REQUIRED.length + ' required files present, plugin folder clean');
}
