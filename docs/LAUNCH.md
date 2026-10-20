# Launch checklist: Figma Community

DevReady isn't published yet. This is the path from local plugin to Community listing, in order. Tick items off as you go.

## 1. Before you submit

- [ ] **Turn on two-factor authentication** on your Figma account. Figma requires it before you can publish.
- [ ] **Get a real plugin ID.** `devready-plugin/manifest.json` has `"id": "devready-inspect-local"`, which is a local placeholder. In the Figma desktop app, go to **Plugins → Development → New plugin…**, create any plugin, copy the `id` from the manifest it generates into ours, then delete the generated folder. Re-import `devready-plugin/manifest.json`.
- [ ] **Run the environment test matrix** (below) on 3–5 real files. Fix anything red.
- [ ] Run `npm test` and `npm run check`. Both must pass.
- [ ] **Make a playground file:** a small public Figma file with
  - one frame marked Ready for dev,
  - one component set with variants,
  - one frame using light/dark variables,
  - one frame not marked ready (to show the gate).

  Reviewers and new users try the plugin there.

## 2. Listing (paste-ready)

**Name:** DevReady: Inspect & Code

**Tagline** (keep it short):
> Dev Mode-style inspect, change tracking and clean code, unlocked when a design is ready for dev.

**Category:** Software development (secondary: Design tools)

**Description:**
> DevReady gives developers a Dev Mode-style Inspect panel, and production-quality code, for designs your team has marked **Ready for dev**.
>
> **For developers**
> • Box model, layout, typography, colors, effects, variables (every mode), interactions and component properties
> • Code in React + TypeScript, React + Tailwind, React + CSS, HTML + CSS, single-file HTML, Vue, Svelte, React Native, SwiftUI, Jetpack Compose and Flutter: semantic tags, design tokens, typed props, reusable components for repeated instances
> • Live preview of the generated HTML next to or on top of the design
> • Assets detected automatically; export PNG/JPG/SVG/PDF or everything as a ZIP
> • See which layers changed since handoff
>
> **For designers**
> • Mark frames ready for dev. Uses Figma's native status, or a free DevReady flag when your plan or mode can't set it
> • Annotations with categories and pinned properties, plus canvas notes that work on every plan
>
> **Optional gate.** Teams without a formal handoff process can turn the gate off and use DevReady as a free inspector and code generator.
>
> **Private by design.** DevReady only contacts Google Fonts, sending font family names and nothing else. No accounts, no analytics.
>
> Free and open source (MIT): github.com/Ankushui18/Dev-Ready

**Images:**

| Slot | File | Size |
|---|---|---|
| Icon | `docs/brand/icon-128.png` | 128×128 |
| Thumbnail | `docs/brand/cover-1920x1080.png` | 1920×1080 |
| Carousel 1 | `docs/screenshots/inspect.png` | Inspect overview |
| Carousel 2 | `docs/screenshots/layer-properties.png` | Box model + tokens |
| Carousel 3 | `docs/screenshots/code-react.png` | React output |
| Carousel 4 | `docs/screenshots/preview-compare.png` | Preview vs design |
| Carousel 5 | `docs/screenshots/annotations.png` | Annotations |
| Carousel 6 | `docs/screenshots/gate-locked.png` | The gate |
| Carousel 7 | `docs/screenshots/inspect-dark.png` | Dark mode |

A 30–45 second screen recording works better than any still image. Show: select frame → Inspect → Code → Preview overlay → change list.

**Support contact:** https://github.com/Ankushui18/Dev-Ready/issues

**Network access:** the label should read **Restricted network access**, because the manifest lists only `fonts.googleapis.com` and `fonts.gstatic.com`.

**Data security disclosure:** fill it in. Answers, consistent with [PRIVACY.md](../PRIVACY.md):
- Collects or transmits user data? **No.** The only outbound requests are font family names to Google Fonts.
- Stores data? Yes, **in the file** (shared plugin data: status flag, note, change-tracking snapshot, component mappings) and **on the device** (settings, uploaded fonts). The snapshot includes short text excerpts and colors for before → after.
- Third parties: Google Fonts, requested only by the panel's preview, for public families (CSS and font files). The plugin code makes no network requests. Can be turned off in ⋯.
- Authentication, payments, analytics: none.

## 3. Environment test matrix

Test each row on a real file. Record ✅ / ⚠️ / ❌ and a one-line note.

| # | Environment | What to check | Result |
|---|---|---|---|
| 1 | Design Mode, panel | Mark ready (native + flag), gate lock/unlock, Inspect, all sections render | |
| 2 | Design Mode, panel | Annotate: native annotation appears (Shift+Y); canvas note on a free plan; group → note fallback | |
| 3 | Design Mode, panel | Start tracking → edit text/fill/padding/rename → change list shows correct before → after; 1,000+ layer frame doesn't error | |
| 4 | Design Mode, panel | Export PNG/SVG/PDF; ZIP download; project ZIP with fonts | |
| 5 | Dev Mode, Inspect → Plugins | Read-only behaviour: flag instead of native status; no canvas writes | |
| 6 | Dev Mode, Inspect → Code | Each DevReady language returns within 3 s on a medium frame; preferences (unit, gate) apply | |
| 7 | Figma for VS Code | Codegen languages appear and produce output | |
| 8 | Panel width | Narrowest and widest Inspect panel: no overflow or clipped buttons | |
| 9 | Themes | Light and dark: all text readable, chips and buttons visible | |
| 10 | Fonts | Google font, variable weight (e.g. 450), custom font (upload), system font (SF); ⋯ → Load Google Fonts in preview off → no font requests | |
| 11 | Variables | Light/dark collection: tokens and modes correct in CSS, SwiftUI and Compose | |
| 12 | Remote library | Instance of a library component; variables from a library | |
| 13 | Preview sandbox | Preview renders, height fits, Overlay/Difference work inside Figma's UI iframe (sandboxed `srcdoc` + CSP) | |
| 14 | Message validation | Normal use never shows a "DevReady: invalid …" toast (component mapping, export at 0.5x–4x, font upload, dev resources, settings) | |

## 4. First 30 days after approval

**Week 1: activation**
- Post in the Figma Community forum (Plugins & widgets) with the 30-second video.
- Watch 3–5 people (designers *and* developers) try it on their own file without help. Note where they get stuck.

**Week 2: fix what you saw**
- Fix the top 3 confusions or bugs. Push an update (Plugins → Manage plugins → Publish new version).
- Add any broken design you saw to `tests/fixtures.js`.

**Week 3: distribution**
- One focused post per strength, each with a GIF:
  - "see what changed since handoff";
  - "SwiftUI/Compose from Figma, free";
  - "preview your Figma frame as real HTML".
- Places to post: r/FigmaDesign, r/Frontend, Dev.to, LinkedIn, X/Bluesky. Share it once per place, and reply to comments.

**Week 4: decide what's next**
- Look at installs vs. weekly runs (Community page stats), plus GitHub issues and stars.
- Pick the next release from what users asked for, not from the feature list.

## 5. Keep it free

Inspection, code generation and export stay free. If teams later ask for shared readiness rules, design-system mapping or reports, consider an optional team tier then. Don't build one before people are using the plugin every week. Note that Figma doesn't let a plugin published as paid become free later, so stay free until you're sure.
