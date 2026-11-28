import type { CodeTarget, DevReadyBundle, InspectLayer, UnitMode } from '../types';
import { runA11yAudit } from './a11y';
import { CODE_TARGETS, generateCode } from './codegen';
import { formatRadius, formatUnit } from './measure';

export type AiExportScope = 'layer' | 'screen';

function renderTreeOutline(node: InspectLayer, depth = 0, maxDepth = 4): string[] {
  if (node.visible === false || depth > maxDepth) return [];
  const indent = '  '.repeat(depth);
  const comp = node.componentName ? ` [Component: ${node.componentName}]` : '';
  const text = node.text ? ` — "${node.text.slice(0, 60)}"` : '';
  const al = node.autoLayout
    ? ` (flex-${node.autoLayout.direction === 'HORIZONTAL' ? 'row' : 'col'} gap:${node.autoLayout.gap}px)`
    : '';
  const lines = [
    `${indent}- ${node.name} (${node.type}, ${Math.round(node.width)}×${Math.round(node.height)})${comp}${al}${text}`
  ];
  if (node.children) {
    for (const child of node.children) {
      lines.push(...renderTreeOutline(child, depth + 1, maxDepth));
    }
  }
  return lines;
}

function collectUsedTokenNames(node: InspectLayer, out = new Set<string>()): Set<string> {
  if (node.radiusToken) out.add(node.radiusToken.replace(/^--/, ''));
  if (node.autoLayout?.gapToken) out.add(node.autoLayout.gapToken.replace(/^--/, ''));
  if (node.autoLayout?.paddingToken) out.add(node.autoLayout.paddingToken.replace(/^--/, ''));
  if (node.typography?.token) out.add(node.typography.token.replace(/^--/, ''));
  node.fills?.forEach(f => f.token && out.add(f.token.replace(/^--/, '')));
  node.strokes?.forEach(s => s.token && out.add(s.token.replace(/^--/, '')));
  node.effects?.forEach(e => e.token && out.add(e.token.replace(/^--/, '')));
  node.children?.forEach(c => collectUsedTokenNames(c, out));
  return out;
}

/**
 * Generates a structured Markdown design-context prompt tailored for
 * AI coding agents (Cursor, Claude Code, Codex, Windsurf) — zero paid MCP required.
 */
export function buildAiPrompt(
  bundle: DevReadyBundle,
  layer: InspectLayer,
  unit: UnitMode,
  codeTarget: CodeTarget,
  scope: AiExportScope = 'layer'
): string {
  const targetNode = scope === 'screen' ? bundle.root : layer;
  const targetMeta = CODE_TARGETS.find(t => t.id === codeTarget);
  const langLabel = targetMeta?.label || codeTarget;
  const fence = targetMeta?.ext || 'tsx';

  const usedTokens = collectUsedTokenNames(targetNode);
  const relevantTokens =
    scope === 'screen'
      ? bundle.tokens
      : bundle.tokens.filter(t => usedTokens.has(t.name) || usedTokens.has(`--${t.name}`));

  const a11yAll = runA11yAudit(bundle.root, bundle.backgroundColor).filter(f => f.severity !== 'pass');
  const a11yFiltered =
    scope === 'screen'
      ? a11yAll
      : a11yAll.filter(f => f.layerId === targetNode.id);

  const lines: string[] = [];
  lines.push(`# Figma Design Context — ${targetNode.name}`);
  lines.push('');
  lines.push(
    `Implement this UI faithfully using **${langLabel}** while preserving exact spacing, typography, tokens, and accessibility requirements.`
  );
  lines.push('');
  lines.push('## Metadata');
  lines.push(`- **File:** ${bundle.fileName || 'DevReady Studio'} / ${bundle.pageName || 'Page 1'}`);
  lines.push(`- **Screen:** ${bundle.name} (${Math.round(bundle.width)}×${Math.round(bundle.height)}, status: \`${bundle.status}\`)`);
  lines.push(
    `- **Target Node:** \`${targetNode.name}\` (\`${targetNode.type}\`${targetNode.componentName ? `, Component: \`${targetNode.componentName}\`` : ''})`
  );
  lines.push(
    `- **Frame Geometry:** \`x: ${formatUnit(targetNode.x, unit)}\`, \`y: ${formatUnit(targetNode.y, unit)}\`, \`w: ${formatUnit(targetNode.width, unit)}\`, \`h: ${formatUnit(targetNode.height, unit)}\``
  );
  if (targetNode.radius !== undefined) {
    lines.push(`- **Border Radius:** \`${formatRadius(targetNode.radius, unit)}\`${targetNode.radiusToken ? ` (\`${targetNode.radiusToken}\`)` : ''}`);
  }
  if (targetNode.opacity !== undefined && targetNode.opacity < 1) {
    lines.push(`- **Opacity:** \`${Math.round(targetNode.opacity * 100)}%\``);
  }

  if (targetNode.autoLayout) {
    const al = targetNode.autoLayout;
    lines.push('');
    lines.push('## Auto Layout');
    lines.push(`- **Direction:** \`${al.direction}\`${al.wrap ? ' (wrap)' : ''}`);
    lines.push(`- **Gap:** \`${formatUnit(al.gap, unit)}\`${al.gapToken ? ` (\`${al.gapToken}\`)` : ''}`);
    lines.push(
      `- **Padding:** \`${formatUnit(al.paddingTop, unit)} ${formatUnit(al.paddingRight, unit)} ${formatUnit(al.paddingBottom, unit)} ${formatUnit(al.paddingLeft, unit)}\``
    );
    if (al.alignItems || al.justifyContent) {
      lines.push(`- **Alignment:** \`align-items: ${al.alignItems || 'START'}\`, \`justify-content: ${al.justifyContent || 'START'}\``);
    }
  }

  if (targetNode.typography) {
    const t = targetNode.typography;
    lines.push('');
    lines.push('## Typography');
    lines.push(`- **Font:** ${t.fontFamily} ${t.fontWeight} · ${formatUnit(t.fontSize, unit)} / ${formatUnit(t.lineHeight, unit)}`);
    if (t.letterSpacing) lines.push(`- **Letter Spacing:** \`${t.letterSpacing}px\``);
    if (t.textAlign) lines.push(`- **Align:** \`${t.textAlign}\``);
    if (targetNode.text) lines.push(`- **Text:** "${targetNode.text}"`);
  }

  if ((targetNode.fills && targetNode.fills.length) || (targetNode.strokes && targetNode.strokes.length) || (targetNode.effects && targetNode.effects.length)) {
    lines.push('');
    lines.push('## Visual Styles');
    targetNode.fills?.forEach(f => {
      lines.push(`- **Fill:** \`${f.color || f.gradient || f.type}\`${f.token ? ` (token: \`${f.token}\`)` : ''}${f.opacity !== undefined && f.opacity < 1 ? ` @ ${Math.round(f.opacity * 100)}%` : ''}`);
    });
    targetNode.strokes?.forEach(s => {
      lines.push(`- **Stroke:** \`${s.width}px solid ${s.color}\`${s.token ? ` (token: \`${s.token}\`)` : ''}`);
    });
    targetNode.effects?.forEach(e => {
      lines.push(`- **Effect (${e.type}):** \`${e.x || 0}px ${e.y || 0}px ${e.blur}px ${e.spread || 0}px ${e.color || ''}\``);
    });
  }

  if (relevantTokens.length > 0) {
    lines.push('');
    lines.push('## Design Tokens');
    for (const tok of relevantTokens.slice(0, 24)) {
      const modeStr = tok.modes
        ? ` (${Object.entries(tok.modes)
            .map(([m, v]) => `${m}: ${v}`)
            .join(', ')})`
        : '';
      lines.push(`- \`--${tok.name}\`: \`${tok.value}\`${modeStr}`);
    }
  }

  if (targetNode.children && targetNode.children.length > 0) {
    lines.push('');
    lines.push('## Layer Structure');
    lines.push(...renderTreeOutline(targetNode, 0, scope === 'screen' ? 5 : 4));
  }

  if (a11yFiltered.length > 0) {
    lines.push('');
    lines.push('## Accessibility Checks');
    for (const issue of a11yFiltered.slice(0, 8)) {
      lines.push(`- [${issue.severity.toUpperCase()}] **${issue.title}** (${issue.layerName}): ${issue.detail}`);
    }
  }

  const anns = (bundle.annotations || []).filter(
    a => scope === 'screen' || a.layerId === targetNode.id
  );
  if (anns.length > 0) {
    lines.push('');
    lines.push('## Designer Annotations');
    for (const ann of anns) {
      lines.push(`- [${ann.category.toUpperCase()}] (\`${ann.layerId}\`): ${ann.text}`);
    }
  }

  const resources = (bundle.devResources || []).filter(
    r => scope === 'screen' || !r.layerId || r.layerId === targetNode.id
  );
  if (resources.length > 0) {
    lines.push('');
    lines.push('## Linked Dev Resources');
    for (const res of resources) {
      lines.push(`- [${res.kind}] **${res.label}**: ${res.url}`);
    }
  }

  const ccMap = bundle.codeConnect || {};
  const connected = targetNode.componentName ? ccMap[targetNode.componentName] : undefined;
  if (connected) {
    lines.push('');
    lines.push('## Code Connect (Use Existing Production Component)');
    lines.push(`- **Design System Component:** \`${connected.componentName}\``);
    lines.push(`- **Import:** \`${connected.importPath}\``);
    if (connected.docsUrl) lines.push(`- **Docs / Source:** ${connected.docsUrl}`);
    lines.push('```tsx');
    lines.push(`${connected.importPath}\n\n${connected.snippet}`);
    lines.push('```');
  }

  lines.push('');
  lines.push(`## Reference Starter (${langLabel})`);
  lines.push(`\`\`\`${fence}`);
  lines.push(generateCode(targetNode, codeTarget, unit));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generates a structured machine-readable MCP-style JSON context object
 * ready for AI coding tools & IDE agents.
 */
export function buildMcpJson(
  bundle: DevReadyBundle,
  layer: InspectLayer,
  unit: UnitMode,
  scope: AiExportScope = 'layer'
): string {
  const targetNode = scope === 'screen' ? bundle.root : layer;
  const usedTokens = collectUsedTokenNames(targetNode);
  const tokens =
    scope === 'screen'
      ? bundle.tokens
      : bundle.tokens.filter(t => usedTokens.has(t.name) || usedTokens.has(`--${t.name}`));
  const a11y = runA11yAudit(bundle.root, bundle.backgroundColor).filter(
    f => f.severity !== 'pass' && (scope === 'screen' || f.layerId === targetNode.id)
  );

  const payload = {
    schema: 'devready.mcp.design-context/v1',
    scope,
    unit,
    source: {
      fileName: bundle.fileName || 'DevReady Studio',
      pageName: bundle.pageName || 'Page 1',
      screenId: bundle.id,
      screenName: bundle.name,
      status: bundle.status,
      viewport: { width: bundle.width, height: bundle.height },
      backgroundColor: bundle.backgroundColor
    },
    node: targetNode,
    tokens,
    tokenModes: bundle.tokenModes || [],
    annotations: (bundle.annotations || []).filter(
      a => scope === 'screen' || a.layerId === targetNode.id
    ),
    devResources: (bundle.devResources || []).filter(
      r => scope === 'screen' || !r.layerId || r.layerId === targetNode.id
    ),
    codeConnect:
      scope === 'screen'
        ? bundle.codeConnect || {}
        : targetNode.componentName && bundle.codeConnect?.[targetNode.componentName]
          ? { [targetNode.componentName]: bundle.codeConnect[targetNode.componentName] }
          : {},
    accessibility: a11y
  };

  return JSON.stringify(payload, null, 2);
}
