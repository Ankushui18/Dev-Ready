import manifestRaw from '../../figma-bridge-plugin/manifest.json?raw';
import codeRaw from '../../figma-bridge-plugin/code.js?raw';
import uiRaw from '../../figma-bridge-plugin/ui.html?raw';
import { makeZip } from './codegen';

const BRIDGE_README = `DevReady Web Bridge — Figma Plugin
====================================

How to install in Figma Desktop (30 seconds):
1. Unzip this folder somewhere permanent (e.g. Documents/devready-figma-bridge).
2. Open Figma Desktop -> Plugins -> Development -> Import plugin from manifest...
3. Select the "manifest.json" file inside this folder.
4. Select any Frame or Component on your Figma canvas, run "DevReady Web Bridge",
   and click "Open in Web Dev Mode" to inspect full-screen on https://devready-studio.vercel.app.
`;

export function buildBridgePluginZip(): Blob {
  return makeZip([
    { name: 'devready-figma-bridge/manifest.json', content: manifestRaw },
    { name: 'devready-figma-bridge/code.js', content: codeRaw },
    { name: 'devready-figma-bridge/ui.html', content: uiRaw },
    { name: 'devready-figma-bridge/README.txt', content: BRIDGE_README }
  ]);
}

export function downloadBridgePluginZip(): void {
  const blob = buildBridgePluginZip();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'devready-figma-bridge-plugin.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
