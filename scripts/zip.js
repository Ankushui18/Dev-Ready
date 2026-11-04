#!/usr/bin/env node
/* Builds devready-plugin.zip (the folder users import into Figma). Uses the system `zip`. */
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
/* LICENSE + NOTICE travel with the ZIP: PolyForm requires the terms to reach
   everyone who receives a copy, including people who only download a release. */
execSync('rm -f devready-plugin.zip && zip -qr devready-plugin.zip devready-plugin LICENSE NOTICE -x devready-plugin/check-sandbox.js', { cwd: root, stdio: 'inherit' });
console.log('wrote devready-plugin.zip');
