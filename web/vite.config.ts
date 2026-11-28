import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Local dev middleware that runs the exact same Vercel /api/handoff handler
function localHandoffApi(): Plugin {
  return {
    name: 'devready-local-handoff-api',
    configureServer(server) {
      server.middlewares.use('/api/handoff', async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const mod = await import('./api/handoff.js');
          const handler = mod.default;
          const url = new URL(req.url || '/', 'http://localhost');
          const query: Record<string, string> = {};
          url.searchParams.forEach((v, k) => { query[k] = v; });

          let body: unknown = undefined;
          if (req.method === 'POST') {
            const MAX_DEV_BYTES = 4.5 * 1024 * 1024;
            const chunks: Buffer[] = [];
            let total = 0;
            for await (const chunk of req) {
              const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              total += buf.length;
              if (total > MAX_DEV_BYTES) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Bundle exceeds 4 MB transfer limit' }));
                return;
              }
              chunks.push(buf);
            }
            const raw = Buffer.concat(chunks).toString('utf8');
            if (raw) {
              try {
                body = JSON.parse(raw);
              } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
              }
            } else {
              body = {};
            }
          }

          const vReq = Object.assign(req, { query, body });
          const vRes = {
            statusCode: 200,
            setHeader: (k: string, v: string) => res.setHeader(k, v),
            status(code: number) {
              this.statusCode = code;
              res.statusCode = code;
              return this;
            },
            json(data: unknown) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(data));
            },
            end(data?: string) {
              res.end(data);
            }
          };

          await handler(vReq, vRes);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localHandoffApi()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  }
});
