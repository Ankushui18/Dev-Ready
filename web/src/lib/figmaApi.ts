import type {
  AutoLayoutSpec,
  DevReadyBundle,
  EffectSpec,
  FillSpec,
  InspectLayer,
  LayerType,
  StrokeSpec,
  TokenEntry,
  TypographySpec
} from '../types';
import { validateBundle } from './transfer';

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId?: string;
  canonicalUrl: string;
}

export interface FigmaFrameCandidate {
  id: string;
  name: string;
  pageName: string;
  type: string;
  width: number;
  height: number;
}

interface FigmaRGBA {
  r: number;
  g: number;
  b: number;
  a?: number;
}

interface FigmaPaint {
  type?: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaRGBA;
  gradientStops?: Array<{ position: number; color: FigmaRGBA }>;
  gradientHandlePositions?: Array<{ x: number; y: number }>;
}

interface FigmaEffect {
  type?: string;
  visible?: boolean;
  radius?: number;
  spread?: number;
  color?: FigmaRGBA;
  offset?: { x: number; y: number };
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  clipsContent?: boolean;
  rotation?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: 'INSIDE' | 'CENTER' | 'OUTSIDE';
  strokeDashes?: number[];
  effects?: FigmaEffect[];
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  layoutWrap?: 'WRAP' | 'NO_WRAP';
  characters?: string;
  style?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    lineHeightPx?: number;
    letterSpacing?: number;
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textCase?: 'UPPER' | 'LOWER' | 'TITLE' | 'ORIGINAL';
  };
  backgroundColor?: FigmaRGBA;
  children?: FigmaNode[];
}

const FIGMA_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_API_NODES = 2500;
const MAX_API_DEPTH = 28;
const MAX_SCREENSHOT_BYTES = 2.5 * 1024 * 1024;

export function parseFigmaUrl(raw: string): ParsedFigmaUrl | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'figma.com' && host !== 'www.figma.com') return null;

  const segments = url.pathname.split('/').filter(Boolean);
  // Matches /design/<key>/..., /file/<key>/..., /proto/<key>/..., /board/<key>/...
  const kindIdx = segments.findIndex(s => s === 'design' || s === 'file' || s === 'proto' || s === 'board');
  if (kindIdx < 0 || !segments[kindIdx + 1]) return null;

  let fileKey = segments[kindIdx + 1];
  // Handle /design/<key>/branch/<branchKey>/...
  if (segments[kindIdx + 2] === 'branch' && segments[kindIdx + 3]) {
    fileKey = segments[kindIdx + 3];
  }
  if (!FIGMA_KEY_RE.test(fileKey)) return null;

  const rawNode = url.searchParams.get('node-id');
  let nodeId: string | undefined;
  if (rawNode) {
    const decoded = decodeURIComponent(rawNode).trim();
    if (/^[0-9]+[-:][0-9]+$/.test(decoded)) {
      nodeId = decoded.replace('-', ':');
    }
  }

  return {
    fileKey,
    nodeId,
    canonicalUrl: nodeId
      ? `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(nodeId.replace(':', '-'))}`
      : `https://www.figma.com/design/${fileKey}`
  };
}

function rgbaToHex(c?: FigmaRGBA): string {
  if (!c) return '#000000';
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round((Number.isFinite(n) ? n : 0) * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function rgbaToCss(c?: FigmaRGBA): string {
  if (!c) return 'rgba(0, 0, 0, 0.25)';
  const r = Math.max(0, Math.min(255, Math.round((c.r || 0) * 255)));
  const g = Math.max(0, Math.min(255, Math.round((c.g || 0) * 255)));
  const b = Math.max(0, Math.min(255, Math.round((c.b || 0) * 255)));
  const a = typeof c.a === 'number' ? Math.round(c.a * 100) / 100 : 1;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mapLayerType(figmaType: string): LayerType {
  switch (figmaType) {
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'COMPONENT';
    case 'INSTANCE':
      return 'INSTANCE';
    case 'GROUP':
    case 'BOOLEAN_OPERATION':
      return 'GROUP';
    case 'TEXT':
      return 'TEXT';
    case 'RECTANGLE':
      return 'RECTANGLE';
    case 'ELLIPSE':
      return 'ELLIPSE';
    case 'VECTOR':
    case 'LINE':
    case 'STAR':
    case 'REGULAR_POLYGON':
      return 'VECTOR';
    default:
      return 'FRAME';
  }
}

function convertFills(fills?: FigmaPaint[]): FillSpec[] | undefined {
  if (!Array.isArray(fills) || fills.length === 0) return undefined;
  const out: FillSpec[] = [];
  for (const f of fills) {
    if (f.visible === false) continue;
    if (f.type === 'SOLID' && f.color) {
      const op = (typeof f.opacity === 'number' ? f.opacity : 1) * (typeof f.color.a === 'number' ? f.color.a : 1);
      out.push({
        type: 'SOLID',
        color: rgbaToHex(f.color),
        opacity: op < 0.995 ? Math.round(op * 100) / 100 : undefined
      });
    } else if (f.type === 'GRADIENT_LINEAR' && Array.isArray(f.gradientStops) && f.gradientStops.length >= 2) {
      const h = f.gradientHandlePositions;
      let angle = 180;
      if (h && h.length >= 2) {
        const dx = h[1].x - h[0].x;
        const dy = h[1].y - h[0].y;
        angle = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360);
      }
      const stops = f.gradientStops
        .map(s => `${rgbaToCss(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      out.push({
        type: 'LINEAR_GRADIENT',
        color: rgbaToHex(f.gradientStops[0].color),
        gradient: `linear-gradient(${angle}deg, ${stops})`
      });
    } else if (f.type === 'IMAGE') {
      out.push({ type: 'IMAGE', color: '#2C2C2C' });
    }
  }
  return out.length > 0 ? out : undefined;
}

function convertStrokes(node: FigmaNode): StrokeSpec[] | undefined {
  if (!Array.isArray(node.strokes) || node.strokes.length === 0 || !node.strokeWeight) return undefined;
  const out: StrokeSpec[] = [];
  for (const s of node.strokes) {
    if (s.visible === false || s.type !== 'SOLID' || !s.color) continue;
    out.push({
      color: rgbaToHex(s.color),
      width: Math.round(node.strokeWeight * 100) / 100,
      align: node.strokeAlign || 'INSIDE',
      dash: Array.isArray(node.strokeDashes) && node.strokeDashes.length > 0 ? node.strokeDashes : undefined
    });
  }
  return out.length > 0 ? out : undefined;
}

function convertEffects(effects?: FigmaEffect[]): EffectSpec[] | undefined {
  if (!Array.isArray(effects) || effects.length === 0) return undefined;
  const out: EffectSpec[] = [];
  for (const ef of effects) {
    if (ef.visible === false) continue;
    if (
      ef.type === 'DROP_SHADOW' ||
      ef.type === 'INNER_SHADOW' ||
      ef.type === 'LAYER_BLUR' ||
      ef.type === 'BACKGROUND_BLUR'
    ) {
      out.push({
        type: ef.type,
        x: ef.offset ? Math.round(ef.offset.x) : undefined,
        y: ef.offset ? Math.round(ef.offset.y) : undefined,
        blur: Math.round(ef.radius || 0),
        spread: typeof ef.spread === 'number' ? Math.round(ef.spread) : undefined,
        color: ef.color ? rgbaToCss(ef.color) : undefined
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

function convertAutoLayout(node: FigmaNode): AutoLayoutSpec | undefined {
  if (node.layoutMode !== 'HORIZONTAL' && node.layoutMode !== 'VERTICAL') return undefined;
  const alignMap: Record<string, AutoLayoutSpec['alignItems']> = {
    MIN: 'START',
    CENTER: 'CENTER',
    MAX: 'END',
    BASELINE: 'CENTER'
  };
  const justifyMap: Record<string, AutoLayoutSpec['justifyContent']> = {
    MIN: 'START',
    CENTER: 'CENTER',
    MAX: 'END',
    SPACE_BETWEEN: 'SPACE_BETWEEN'
  };
  return {
    direction: node.layoutMode,
    gap: Math.round(node.itemSpacing || 0),
    paddingTop: Math.round(node.paddingTop || 0),
    paddingRight: Math.round(node.paddingRight || 0),
    paddingBottom: Math.round(node.paddingBottom || 0),
    paddingLeft: Math.round(node.paddingLeft || 0),
    alignItems: node.counterAxisAlignItems ? alignMap[node.counterAxisAlignItems] : 'START',
    justifyContent: node.primaryAxisAlignItems ? justifyMap[node.primaryAxisAlignItems] : 'START',
    wrap: node.layoutWrap === 'WRAP' ? true : undefined
  };
}

function convertTypography(node: FigmaNode): TypographySpec | undefined {
  if (node.type !== 'TEXT' || !node.style) return undefined;
  const st = node.style;
  const fontSize = Math.round((st.fontSize || 14) * 100) / 100;
  const textTransform =
    st.textCase === 'UPPER'
      ? 'UPPERCASE'
      : st.textCase === 'LOWER'
        ? 'LOWERCASE'
        : st.textCase === 'TITLE'
          ? 'CAPITALIZE'
          : undefined;
  const textAlign =
    st.textAlignHorizontal === 'CENTER'
      ? 'CENTER'
      : st.textAlignHorizontal === 'RIGHT'
        ? 'RIGHT'
        : 'LEFT';
  return {
    fontFamily: st.fontFamily || 'Inter',
    fontWeight: st.fontWeight || 400,
    fontSize,
    lineHeight: Math.round((st.lineHeightPx || fontSize * 1.4) * 100) / 100,
    letterSpacing:
      typeof st.letterSpacing === 'number' && Math.abs(st.letterSpacing) > 0.001
        ? Math.round(st.letterSpacing * 100) / 100
        : undefined,
    textAlign,
    textTransform
  };
}

function convertNodeTree(
  node: FigmaNode,
  originX: number,
  originY: number,
  depth: number,
  counter: { count: number },
  colorSet: Map<string, number>,
  radiusSet: Set<number>,
  typeSet: Map<string, TypographySpec>
): InspectLayer | null {
  if (node.visible === false || counter.count >= MAX_API_NODES) return null;
  counter.count += 1;

  const box = node.absoluteBoundingBox || { x: originX, y: originY, width: 100, height: 40 };
  const fills = convertFills(node.fills);
  const strokes = convertStrokes(node);
  const effects = convertEffects(node.effects);
  const autoLayout = convertAutoLayout(node);
  const typography = convertTypography(node);

  // Collect tokens
  if (fills) {
    for (const f of fills) {
      if (f.type === 'SOLID' && f.color) {
        colorSet.set(f.color, (colorSet.get(f.color) || 0) + 1);
      }
    }
  }
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    radiusSet.add(Math.round(node.cornerRadius));
  }
  if (typography) {
    const key = `${typography.fontFamily}-${typography.fontWeight}-${typography.fontSize}`;
    if (!typeSet.has(key)) typeSet.set(key, typography);
  }

  let radius: number | [number, number, number, number] | undefined;
  if (Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.length === 4) {
    const [r0, r1, r2, r3] = node.rectangleCornerRadii.map(v => Math.round(v));
    if (r0 === r1 && r1 === r2 && r2 === r3) {
      radius = r0 > 0 ? r0 : undefined;
    } else {
      radius = [r0, r1, r2, r3];
    }
  } else if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    radius = Math.round(node.cornerRadius);
  }

  const children: InspectLayer[] = [];
  if (depth < MAX_API_DEPTH && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (counter.count >= MAX_API_NODES) break;
      const converted = convertNodeTree(child, originX, originY, depth + 1, counter, colorSet, radiusSet, typeSet);
      if (converted) children.push(converted);
    }
  }

  const mappedType =
    fills?.some(f => f.type === 'IMAGE') && children.length === 0 ? 'IMAGE' : mapLayerType(node.type);

  return {
    id: node.id,
    name: node.name || mappedType,
    type: mappedType,
    x: Math.round((box.x - originX) * 100) / 100,
    y: Math.round((box.y - originY) * 100) / 100,
    width: Math.max(1, Math.round(box.width * 100) / 100),
    height: Math.max(1, Math.round(box.height * 100) / 100),
    opacity: typeof node.opacity === 'number' && node.opacity < 0.995 ? Math.round(node.opacity * 100) / 100 : undefined,
    rotation: typeof node.rotation === 'number' && Math.abs(node.rotation) > 0.1 ? Math.round(node.rotation) : undefined,
    radius,
    clipsContent: node.clipsContent ? true : undefined,
    visible: true,
    componentName: mappedType === 'COMPONENT' || mappedType === 'INSTANCE' ? node.name : undefined,
    fills,
    strokes,
    effects,
    autoLayout,
    typography,
    text: node.type === 'TEXT' ? node.characters || '' : undefined,
    children: children.length > 0 ? children : undefined
  };
}

function buildExtractedTokens(
  colorSet: Map<string, number>,
  radiusSet: Set<number>,
  typeSet: Map<string, TypographySpec>
): TokenEntry[] {
  const tokens: TokenEntry[] = [];
  const topColors = [...colorSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  topColors.forEach(([hex], i) => {
    tokens.push({
      name: `--color-palette-${i + 1}`,
      category: 'color',
      value: hex
    });
  });

  [...radiusSet]
    .sort((a, b) => a - b)
    .slice(0, 6)
    .forEach(r => {
      tokens.push({
        name: `--radius-${r}`,
        category: 'radius',
        value: `${r}px`
      });
    });

  [...typeSet.values()].slice(0, 8).forEach((t, i) => {
    tokens.push({
      name: `--type-style-${i + 1}`,
      category: 'typography',
      value: `${t.fontFamily} ${t.fontWeight} ${t.fontSize}px/${t.lineHeight}px`
    });
  });

  return tokens;
}

async function figmaFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: {
      'X-Figma-Token': token.trim()
    }
  });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('Figma rejected the token (403). Check your Personal Access Token and file permissions.');
    }
    if (res.status === 404) {
      throw new Error('Figma file or frame not found (404). Verify the URL and node-id.');
    }
    if (res.status === 429) {
      throw new Error('Figma API rate limit reached (429). Wait a moment and try again.');
    }
    throw new Error(`Figma API error (${res.status}).`);
  }
  return res;
}

async function fetchScreenshotDataUrl(fileKey: string, nodeId: string, token: string): Promise<string | undefined> {
  try {
    const imgRes = await figmaFetch(
      `/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&scale=2&format=png`,
      token
    );
    const data = (await imgRes.json()) as { images?: Record<string, string | null> };
    const imageUrl = data.images?.[nodeId];
    if (!imageUrl || !imageUrl.startsWith('https://')) return undefined;

    const binRes = await fetch(imageUrl);
    if (!binRes.ok) return undefined;
    const blob = await binRes.blob();
    if (blob.size > MAX_SCREENSHOT_BYTES) return undefined;

    return await new Promise<string | undefined>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export async function listFigmaFrames(
  fileKey: string,
  token: string
): Promise<{ fileName: string; frames: FigmaFrameCandidate[] }> {
  const res = await figmaFetch(`/files/${encodeURIComponent(fileKey)}?depth=2`, token);
  const data = (await res.json()) as { name?: string; document?: { children?: FigmaNode[] } };
  const fileName = data.name || 'Figma File';
  const frames: FigmaFrameCandidate[] = [];

  for (const page of data.document?.children || []) {
    const pageName = page.name || 'Page 1';
    for (const child of page.children || []) {
      if (child.visible === false) continue;
      if (
        child.type === 'FRAME' ||
        child.type === 'COMPONENT' ||
        child.type === 'COMPONENT_SET' ||
        child.type === 'SECTION'
      ) {
        const box = child.absoluteBoundingBox;
        frames.push({
          id: child.id,
          name: child.name || 'Frame',
          pageName,
          type: child.type,
          width: Math.round(box?.width || 0),
          height: Math.round(box?.height || 0)
        });
      }
    }
  }
  return { fileName, frames };
}

export async function fetchFigmaBundle(opts: {
  fileKey: string;
  nodeId: string;
  fileName?: string;
  pageName?: string;
  canonicalUrl?: string;
  token: string;
  onStage?: (msg: string) => void;
}): Promise<DevReadyBundle> {
  const { fileKey, nodeId, token, onStage } = opts;

  onStage?.('Fetching frame layers from Figma…');
  const nodeRes = await figmaFetch(
    `/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}`,
    token
  );
  const payload = (await nodeRes.json()) as {
    name?: string;
    nodes?: Record<string, { document?: FigmaNode }>;
  };

  const entry = payload.nodes?.[nodeId];
  const doc = entry?.document;
  if (!doc) {
    throw new Error(`Node "${nodeId}" was not found in this Figma file.`);
  }

  const rootBox = doc.absoluteBoundingBox || { x: 0, y: 0, width: 1200, height: 800 };
  const colorSet = new Map<string, number>();
  const radiusSet = new Set<number>();
  const typeSet = new Map<string, TypographySpec>();
  const counter = { count: 0 };

  const root = convertNodeTree(doc, rootBox.x, rootBox.y, 0, counter, colorSet, radiusSet, typeSet);
  if (!root) {
    throw new Error('Selected Figma frame is hidden or empty.');
  }

  onStage?.('Rendering 2× retina preview…');
  const screenshotDataUrl = await fetchScreenshotDataUrl(fileKey, nodeId, token);

  const bgFill = root.fills?.find(f => f.type === 'SOLID' && f.color)?.color;
  const bg = bgFill || (doc.backgroundColor ? rgbaToHex(doc.backgroundColor) : '#FFFFFF');
  const now = new Date().toISOString();

  const rawBundle: DevReadyBundle = {
    version: 1,
    id: `figma-${fileKey}-${nodeId.replace(/[^A-Za-z0-9]/g, '_')}`,
    name: doc.name || 'Figma Frame',
    fileName: opts.fileName || payload.name || 'Figma File',
    pageName: opts.pageName || 'Figma Import',
    figmaUrl: opts.canonicalUrl || `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(nodeId.replace(':', '-'))}`,
    status: 'ready',
    updatedAt: now,
    source: 'figma-api',
    width: Math.max(1, Math.round(rootBox.width)),
    height: Math.max(1, Math.round(rootBox.height)),
    backgroundColor: bg,
    screenshotDataUrl,
    root,
    tokens: buildExtractedTokens(colorSet, radiusSet, typeSet),
    history: [
      {
        id: `h-import-${Date.now()}`,
        summary: `Imported "${doc.name || 'Frame'}" via Figma URL`,
        status: 'ready',
        timestamp: now,
        rootSnapshot: root
      }
    ]
  };

  return validateBundle(rawBundle);
}
