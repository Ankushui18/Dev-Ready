/**
 * Vercel Serverless Function: /api/handoff
 *
 * Zero-cost temporary dropbox for end-to-end encrypted DevReady Inspect Bundles.
 * - The client encrypts the bundle with AES-GCM 256-bit BEFORE uploading.
 * - The decryption key stays exclusively in the URL fragment (#k=...) and is
 *   NEVER sent to this API.
 * - Storage backend priority (all $0 free tiers):
 *     1. Upstash Redis REST API (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *        — auto-expires after 7 days (TTL = 604800s).
 *     2. In-memory ephemeral store (for local Vite dev / preview without env vars).
 */
import crypto from 'node:crypto';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB compressed+encrypted ceiling
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Ephemeral fallback for local dev / zero-config preview
const memoryStore = globalThis.__devreadyHandoffStore || new Map();
globalThis.__devreadyHandoffStore = memoryStore;

function pruneMemory() {
  const now = Date.now();
  for (const [k, v] of memoryStore.entries()) {
    if (v.expiresAt <= now) memoryStore.delete(k);
  }
  // Cap memory store to 50 items so local preview never leaks RAM
  while (memoryStore.size > 50) {
    const oldest = memoryStore.keys().next().value;
    if (oldest) memoryStore.delete(oldest);
    else break;
  }
}

function makeId() {
  return crypto.randomBytes(6).toString('base64url');
}

function makeRevokeToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url: url.replace(/\/+$/, ''), token };
  return null;
}

async function savePayload(id, record) {
  const cfg = upstashConfig();
  const serialized = JSON.stringify(record);
  if (cfg) {
    const res = await fetch(`${cfg.url}/set/devready:${encodeURIComponent(id)}?EX=${TTL_SECONDS}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: serialized
    });
    if (!res.ok) throw new Error('Storage write failed (' + res.status + ')');
    return 'upstash';
  }
  pruneMemory();
  memoryStore.set(id, { data: serialized, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  return 'memory';
}

async function readPayload(id) {
  const cfg = upstashConfig();
  if (cfg) {
    const res = await fetch(`${cfg.url}/get/devready:${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.result !== 'string') return null;
    return JSON.parse(json.result);
  }
  pruneMemory();
  const hit = memoryStore.get(id);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return JSON.parse(hit.data);
}

async function deletePayload(id) {
  const cfg = upstashConfig();
  if (cfg) {
    const res = await fetch(`${cfg.url}/del/devready:${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}` }
    });
    return res.ok;
  }
  pruneMemory();
  return memoryStore.delete(id);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    const id = typeof req.query?.id === 'string' ? req.query.id.trim() : '';
    if (!id || !/^[A-Za-z0-9_-]{4,32}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid handoff ID' });
    }
    try {
      const record = await readPayload(id);
      if (!record) {
        return res.status(404).json({ error: 'Handoff link expired or revoked' });
      }
      // Never expose revokeHash to readers
      const { revokeHash: _omit, ...publicRecord } = record;
      return res.status(200).json(publicRecord);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load bundle' });
    }
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query?.id === 'string' ? req.query.id.trim() : '';
    const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
    if (!id || !/^[A-Za-z0-9_-]{4,32}$/.test(id) || !token) {
      return res.status(400).json({ error: 'Missing id or revoke token' });
    }
    try {
      const record = await readPayload(id);
      if (!record) {
        return res.status(200).json({ revoked: true, alreadyGone: true });
      }
      if (!record.revokeHash || !safeEqualHex(record.revokeHash, hashToken(token))) {
        return res.status(403).json({ error: 'Invalid revoke token' });
      }
      await deletePayload(id);
      return res.status(200).json({ revoked: true });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to revoke link' });
    }
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Invalid JSON body' });
        }
      }
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      // Accept either E2E encrypted envelope ({ v: 1, enc: true, iv, ct })
      // or compressed plain envelope ({ v: 1, enc: false, data }) from Figma plugin
      const payloadStr = JSON.stringify(body);
      if (Buffer.byteLength(payloadStr, 'utf8') > MAX_BYTES) {
        return res.status(413).json({ error: 'Bundle exceeds 4 MB transfer limit' });
      }
      if (body.v !== 1 || (body.enc !== true && body.enc !== false)) {
        return res.status(400).json({ error: 'Unsupported bundle envelope format' });
      }
      if (body.enc === true && (typeof body.iv !== 'string' || !body.iv || typeof body.ct !== 'string' || !body.ct)) {
        return res.status(400).json({ error: 'Encrypted envelope requires iv and ct' });
      }
      if (body.enc === false && (typeof body.data !== 'string' || !body.data)) {
        return res.status(400).json({ error: 'Plain envelope requires data' });
      }

      const id = makeId();
      const revokeToken = makeRevokeToken();
      const record = {
        v: 1,
        enc: Boolean(body.enc),
        iv: typeof body.iv === 'string' ? body.iv : undefined,
        ct: typeof body.ct === 'string' ? body.ct : undefined,
        data: typeof body.data === 'string' ? body.data : undefined,
        name: typeof body.name === 'string' ? body.name.slice(0, 120) : 'Untitled Frame',
        revokeHash: hashToken(revokeToken),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString()
      };

      const backend = await savePayload(id, record);
      return res.status(201).json({
        id,
        revokeToken,
        backend,
        expiresAt: record.expiresAt,
        ttlDays: 7
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to store bundle' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
