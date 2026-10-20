#!/usr/bin/env node
/* Builds devready-plugin.zip (the folder users import into Figma). Uses the system `zip`. */
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
execSync('rm -f devready-plugin.zip && zip -qr devready-plugin.zip devready-plugin -x devready-plugin/check-sandbox.js', { cwd: root, stdio: 'inherit' });
console.log('wrote devready-plugin.zip');
