# DevReady Web Studio

A standalone, **zero-cost full-screen Figma Dev Mode on the web** — isolated in `web/` so the main Figma plugin (`devready-plugin/`) stays 100% untouched.

## What You Get
- **Full-Screen Interactive Inspect Canvas**: Zoom, pan (`Space+Drag`), click any layer to inspect, **Hover-to-Measure redline distances** between any two layers, Auto Layout padding overlays, and wireframe outlines (`Shift+O`).
- **3 Canvas Modes**: `Inspect` · `HTML Preview` · `Diff Overlay` (difference blend mode to spot mismatches).
- **12 Codegen Targets**: React + TS + Tailwind, React + Tailwind, React + CSS, HTML + CSS, Vue 3, Svelte, Tailwind, CSS, React Native, SwiftUI, Jetpack Compose, Flutter — plus 1-click **Project ZIP** download.
- **Design Tokens + Variable Modes**: Export as CSS Variables, Tailwind v4 `@theme`, DTCG JSON, or SCSS.
- **WCAG 2.2 Accessibility Audit & SVG Asset Export**: Real contrast checks + 44×44 touch-target checks + click-to-jump on canvas.
- **Local Workspace (IndexedDB)**: Track screens (`Ready for Dev` / `In Progress` / `Shipped`) locally with zero login.

---

## Zero-Cost ($0) Figma → Web Transfer Architecture

| Mode | How it works | Cost |
|---|---|---|
| **1-Click Encrypted Link** | Companion plugin (`web/figma-bridge-plugin/`) compresses + **AES-256-GCM encrypts** the frame locally, uploads ciphertext to Vercel `/api/handoff` (7-day TTL via Upstash Redis Free Tier), and opens `https://your-app.vercel.app/?s=<id>#k=<key>` directly. Server never sees the key (`#k=`). | **$0 / month** |
| **Offline Clipboard Bridge** | Click **Copy for Web** → opens Web Studio → press `Ctrl+V` / `Cmd+V`. Works with zero server and unlimited size. | **$0 forever** |
| **Portable `.html` / `.devready.json`** | Export a self-contained interactive `.html` inspect file or `.devready.json` bundle to share on Slack/Drive. | **$0 forever** |

---

## Run Locally

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. Both the Web Studio and local `/api/handoff` encrypted share links work out of the box.

## Deploy to Vercel ($0 Hobby Plan)

1. Import this GitHub repository in [Vercel](https://vercel.com/new).
2. Set **Root Directory** to **`web`**.
3. Click **Deploy** (Vite + `/api/handoff` serverless function auto-configure via `web/vercel.json`).
4. *(Optional — for persistent 7-day 1-click cloud links across devices)*: Add free [Upstash Redis](https://upstash.com/) env vars in Vercel Project Settings:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## Companion Figma Bridge Plugin

Without touching `devready-plugin/`:
1. In Figma Desktop: **Plugins → Development → Import plugin from manifest…**
2. Select `web/figma-bridge-plugin/manifest.json`.
3. Paste your deployed Vercel URL (or `http://localhost:5173`), select any frame, and click **Open in Web Dev Mode ↗**.
