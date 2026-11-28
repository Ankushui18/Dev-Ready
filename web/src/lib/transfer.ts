import type { AssetEntry, DevReadyBundle, InspectLayer } from '../types';

const CLIPBOARD_PREFIX = 'DEVREADY1:';

const MAX_TREE_DEPTH = 40;
const MAX_LAYER_NODES = 5000;
const SAFE_SCREENSHOT_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;
const SAFE_HTTP_URL_RE = /^https?:\/\//i;
const UNSAFE_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Strip active script, SMIL animation, embedded HTML, external tracking, and event-handler payloads from imported SVG strings */
export function sanitizeSvg(svg?: string): string | undefined {
  if (!svg || typeof svg !== 'string') return svg;
  return svg
    .replace(/<(script|foreignObject|iframe|object|embed|style|set|animate|animateTransform|animateMotion|handler)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|foreignObject|iframe|object|embed|meta|link|base|set|animate|animateTransform|animateMotion)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href|src)\s*=\s*(?:"[^"]*(?:javascript:|vbscript:|data:text\/|data:image\/svg|&#|%6a|https?:\/\/)[^"]*"|'[^']*(?:javascript:|vbscript:|data:text\/|data:image\/svg|&#|%6a|https?:\/\/)[^']*'|[^\s>]*(?:javascript:|vbscript:|data:|https?:\/\/)[^\s>]*)/gi, '');
}

function sanitizeLayerTree(layer: InspectLayer, depth = 0, counter = { n: 0 }): InspectLayer {
  counter.n++;
  const { children: rawChildren, svg: rawSvg, ...rest } = layer;
  const nextSvg = rawSvg ? sanitizeSvg(rawSvg) : undefined;
  const safeX = Number.isFinite(layer.x) ? layer.x : 0;
  const safeY = Number.isFinite(layer.y) ? layer.y : 0;
  const safeW = Number.isFinite(layer.width) && layer.width >= 0 ? layer.width : 0;
  const safeH = Number.isFinite(layer.height) && layer.height >= 0 ? layer.height : 0;
  let nextChildren: InspectLayer[] | undefined;
  if (Array.isArray(rawChildren) && depth < MAX_TREE_DEPTH && counter.n < MAX_LAYER_NODES) {
    nextChildren = [];
    for (const child of rawChildren) {
      if (counter.n >= MAX_LAYER_NODES) break;
      if (child && typeof child === 'object') {
        nextChildren.push(sanitizeLayerTree(child, depth + 1, counter));
      }
    }
  }
  return {
    ...rest,
    x: safeX,
    y: safeY,
    width: safeW,
    height: safeH,
    ...(nextSvg !== undefined ? { svg: nextSvg } : {}),
    ...(nextChildren !== undefined ? { children: nextChildren } : {})
  };
}

function sanitizeCodeConnect(raw: unknown): DevReadyBundle['codeConnect'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: NonNullable<DevReadyBundle['codeConnect']> = Object.create(null);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (UNSAFE_PROTO_KEYS.has(k) || !v || typeof v !== 'object') continue;
    out[k] = v as NonNullable<DevReadyBundle['codeConnect']>[string];
  }
  return Object.keys(out).length > 0 ? { ...out } : undefined;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gzipCompress(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return input;
  const cs = new CompressionStream('gzip');
  // Must attach reader BEFORE writing to avoid backpressure deadlock on payloads > 64 KB
  const readPromise = new Response(cs.readable).arrayBuffer();
  const writer = cs.writable.getWriter();
  await writer.write(input as unknown as BufferSource);
  await writer.close();
  return new Uint8Array(await readPromise);
}

async function gzipDecompress(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') return input;
  // Detect gzip magic bytes 1f 8b
  if (input.length < 2 || input[0] !== 0x1f || input[1] !== 0x8b) return input;
  const ds = new DecompressionStream('gzip');
  const readPromise = new Response(ds.readable).arrayBuffer();
  const writer = ds.writable.getWriter();
  await writer.write(input as unknown as BufferSource);
  await writer.close();
  return new Uint8Array(await readPromise);
}

export function validateBundle(raw: unknown): DevReadyBundle {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid bundle format');
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 || !obj.root || typeof obj.root !== 'object') {
    throw new Error('Unsupported DevReady bundle version (expected v1)');
  }
  const root = obj.root as Record<string, unknown>;
  if (typeof root.id !== 'string' || typeof root.width !== 'number' || typeof root.height !== 'number') {
    throw new Error('Bundle root layer is missing geometry');
  }
  return {
    version: 1,
    id: typeof obj.id === 'string' ? obj.id : `bundle-${Date.now()}`,
    name: typeof obj.name === 'string' ? obj.name : 'Imported Frame',
    fileName: typeof obj.fileName === 'string' ? obj.fileName : undefined,
    pageName: typeof obj.pageName === 'string' ? obj.pageName : undefined,
    figmaUrl: typeof obj.figmaUrl === 'string' && SAFE_HTTP_URL_RE.test(obj.figmaUrl.trim()) ? obj.figmaUrl.trim() : undefined,
    status: obj.status === 'in-progress' || obj.status === 'done' ? obj.status : 'ready',
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    source:
      obj.source === 'figma-plugin' ||
      obj.source === 'figma-api' ||
      obj.source === 'cloud-link' ||
      obj.source === 'demo'
        ? obj.source
        : 'file',
    width: typeof obj.width === 'number' && Number.isFinite(obj.width) && obj.width > 0 ? obj.width : root.width,
    height: typeof obj.height === 'number' && Number.isFinite(obj.height) && obj.height > 0 ? obj.height : root.height,
    backgroundColor: typeof obj.backgroundColor === 'string' ? obj.backgroundColor : '#FFFFFF',
    screenshotDataUrl:
      typeof obj.screenshotDataUrl === 'string' && SAFE_SCREENSHOT_RE.test(obj.screenshotDataUrl)
        ? obj.screenshotDataUrl
        : undefined,
    root: sanitizeLayerTree(obj.root as DevReadyBundle['root']),
    tokens: Array.isArray(obj.tokens) ? (obj.tokens as DevReadyBundle['tokens']) : [],
    tokenModes: Array.isArray(obj.tokenModes) ? (obj.tokenModes as string[]) : undefined,
    assets: Array.isArray(obj.assets)
      ? (obj.assets as AssetEntry[]).map(a => (a.svg ? { ...a, svg: sanitizeSvg(a.svg) } : a))
      : [],
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    checklist: Array.isArray(obj.checklist) ? (obj.checklist as DevReadyBundle['checklist']) : undefined,
    annotations: Array.isArray(obj.annotations) ? (obj.annotations as DevReadyBundle['annotations']) : undefined,
    devResources: Array.isArray(obj.devResources)
      ? (obj.devResources as DevReadyBundle['devResources'])!.filter(
          r => r && typeof r.url === 'string' && SAFE_HTTP_URL_RE.test(r.url.trim())
        )
      : undefined,
    codeConnect: sanitizeCodeConnect(obj.codeConnect),
    history: Array.isArray(obj.history) ? (obj.history as DevReadyBundle['history']) : undefined,
    measurements: Array.isArray(obj.measurements)
      ? (obj.measurements as DevReadyBundle['measurements'])
      : undefined
  };
}

/** Encode bundle into compact clipboard / hash string: DEVREADY1:<gzip-b64url> */
export async function encodeClipboardBundle(bundle: DevReadyBundle): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(bundle));
  const compressed = await gzipCompress(raw);
  return CLIPBOARD_PREFIX + toBase64Url(compressed);
}

/** Decode DEVREADY1:<gzip-b64url>, a pasted DevReady share URL, OR plain JSON */
export async function decodeClipboardOrJson(text: string): Promise<DevReadyBundle> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Clipboard is empty');

  // Handle pasted DevReady share URLs (?s=<id>#k=<key> or #b=<bundle>)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsedUrl = new URL(trimmed);
      const shareId = parsedUrl.searchParams.get('s');
      const hashStr = parsedUrl.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashStr);
      if (shareId) {
        return await loadCloudShareLink(shareId, hashParams.get('k') || undefined);
      }
      const bParam = hashParams.get('b');
      if (bParam) {
        return await decodeHashBundle(bParam);
      }
    } catch (e) {
      if (e instanceof Error && !/Invalid URL/i.test(e.message)) {
        throw e;
      }
    }
    throw new Error('Paste a DevReady share link, Bridge clipboard copy, or .devready.json.');
  }

  if (trimmed.startsWith(CLIPBOARD_PREFIX)) {
    const payload = trimmed.slice(CLIPBOARD_PREFIX.length);
    const bytes = fromBase64Url(payload);
    const plain = await gzipDecompress(bytes);
    const json = JSON.parse(new TextDecoder().decode(plain));
    return validateBundle(json);
  }
  const json = JSON.parse(trimmed);
  return validateBundle(json);
}

/** Decode direct URL #b=<b64url> lightweight transfer */
export async function decodeHashBundle(hashParam: string): Promise<DevReadyBundle> {
  const bytes = fromBase64Url(hashParam);
  const plain = await gzipDecompress(bytes);
  const json = JSON.parse(new TextDecoder().decode(plain));
  return validateBundle(json);
}

/**
 * End-to-End Encrypted 1-Click Share Upload via /api/handoff.
 * - Compresses with gzip
 * - Encrypts with fresh 256-bit AES-GCM key in the browser
 * - Uploads opaque ciphertext to Vercel /api/handoff
 * - Returns shareable URL with the decryption key ONLY in the URL #k=... fragment
 */
export interface SavedShareLink {
  id: string;
  screenId: string;
  screenName: string;
  url: string;
  revokeToken?: string;
  createdAt: string;
  expiresAt?: string;
}

const SHARE_LINKS_KEY = 'devready-active-share-links';

export function getSavedShareLinks(screenId?: string): SavedShareLink[] {
  try {
    const raw = localStorage.getItem(SHARE_LINKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedShareLink[];
    const now = Date.now();
    const alive = parsed.filter(l => !l.expiresAt || new Date(l.expiresAt).getTime() > now);
    if (alive.length !== parsed.length) {
      localStorage.setItem(SHARE_LINKS_KEY, JSON.stringify(alive));
    }
    return screenId ? alive.filter(l => l.screenId === screenId) : alive;
  } catch {
    return [];
  }
}

export function saveShareLinkRecord(link: SavedShareLink): void {
  try {
    const prev = getSavedShareLinks();
    const next = [link, ...prev.filter(l => l.id !== link.id)].slice(0, 24);
    localStorage.setItem(SHARE_LINKS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota issues
  }
}

export function removeSavedShareLink(id: string): void {
  try {
    const prev = getSavedShareLinks();
    localStorage.setItem(SHARE_LINKS_KEY, JSON.stringify(prev.filter(l => l.id !== id)));
  } catch {
    // ignore
  }
}

export async function createEncryptedShareLink(
  bundle: DevReadyBundle
): Promise<{
  url: string;
  id: string;
  revokeToken?: string;
  expiresAt?: string;
  backend: string;
  ttlDays: number;
  encrypted: boolean;
}> {
  const raw = new TextEncoder().encode(JSON.stringify(bundle));
  const compressed = await gzipCompress(raw);

  const canEncrypt = typeof crypto !== 'undefined' && Boolean(crypto.subtle);
  let envelope: Record<string, unknown>;
  let keyFragment = '';

  if (canEncrypt) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed as unknown as BufferSource);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    keyFragment = `#k=${toBase64Url(rawKey)}`;
    envelope = {
      v: 1,
      enc: true,
      name: bundle.name,
      iv: toBase64Url(iv),
      ct: toBase64Url(new Uint8Array(ctBuf))
    };
  } else {
    envelope = {
      v: 1,
      enc: false,
      name: bundle.name,
      data: toBase64Url(compressed)
    };
  }

  const res = await fetch('/api/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Upload failed (${res.status})`);
  }

  const data = (await res.json()) as {
    id: string;
    revokeToken?: string;
    expiresAt?: string;
    backend: string;
    ttlDays: number;
  };
  const url = `${window.location.origin}/?s=${encodeURIComponent(data.id)}${keyFragment}`;
  saveShareLinkRecord({
    id: data.id,
    screenId: bundle.id,
    screenName: bundle.name,
    url,
    revokeToken: data.revokeToken,
    createdAt: new Date().toISOString(),
    expiresAt: data.expiresAt
  });
  return {
    url,
    id: data.id,
    revokeToken: data.revokeToken,
    expiresAt: data.expiresAt,
    backend: data.backend,
    ttlDays: data.ttlDays || 7,
    encrypted: canEncrypt
  };
}

/** Revoke a previously created cloud handoff link immediately */
export async function revokeCloudShareLink(id: string, revokeToken: string): Promise<void> {
  const res = await fetch(
    `/api/handoff?id=${encodeURIComponent(id)}&token=${encodeURIComponent(revokeToken)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Revoke failed (${res.status})`);
  }
  removeSavedShareLink(id);
}

/** Load and decrypt a cloud handoff link (?s=<id> + optional #k=<key>) */
export async function loadCloudShareLink(id: string, keyB64?: string): Promise<DevReadyBundle> {
  const res = await fetch(`/api/handoff?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Handoff link expired or not found');
  }
  const record = (await res.json()) as {
    v: number;
    enc: boolean;
    iv?: string;
    ct?: string;
    data?: string;
  };

  let compressed: Uint8Array;
  if (record.enc) {
    if (!keyB64) throw new Error('Missing decryption key in URL fragment (#k=...)');
    if (!record.iv || !record.ct) throw new Error('Encrypted payload is incomplete');
    const rawKey = fromBase64Url(keyB64);
    const key = await crypto.subtle.importKey('raw', rawKey as unknown as BufferSource, 'AES-GCM', false, ['decrypt']);
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(record.iv) as unknown as BufferSource },
      key,
      fromBase64Url(record.ct) as unknown as BufferSource
    );
    compressed = new Uint8Array(ptBuf);
  } else {
    if (!record.data) throw new Error('Payload data missing');
    compressed = fromBase64Url(record.data);
  }

  const plain = await gzipDecompress(compressed);
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  const bundle = validateBundle(parsed);
  return { ...bundle, source: 'cloud-link' };
}
