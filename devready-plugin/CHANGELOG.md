# Changelog

All notable changes to DevReady are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [SemVer](https://semver.org/).

## [1.2.0] — 2026-10-20

Closes more of the gap with Figma Dev Mode.

### Added
- **4 new code targets** (Dev Mode Code section and panel): **Vue** single-file component, **Svelte**, **React Native** (`StyleSheet`, props components, SVG via react-native-svg) and **Flutter** (Dart widgets, `AppColors` tokens, light/dark values). Design text can never reach `{{ }}` (Vue) or `{ }` (Svelte) expressions, or Dart `$` interpolation.
- **Accessibility section** in Inspect: WCAG contrast for every text layer (finds the real background from covering layers, handles opacity, large-text rules, flags gradients as unmeasured), touch-target size (24px fail, 44px mobile warning), icon-only controls without a label, text under 12px. Click a row to select the layer.
- **Design tokens export** (This layer / Whole file) as CSS variables, SCSS, JSON in the design-tokens format, or a Tailwind v4 `@theme`. Includes every variable mode, `{alias}` references, color and text styles, rem option, copy and download. Variable names are sanitised, so hostile names stay inert.
- 45 new checks (110 total), including template-injection guards for the new targets.

### Changed
- **Single HTML is readable now.** SVG icons are inline `<svg>` elements (no base64 in `src`), and raster images are CSS backgrounds whose data URI sits once in a labelled `:root` block at the end of the stylesheet, so the HTML and component CSS stay clean.
- Manifest lists the new languages; `gen-code` and `tokens-export` messages are validated.

## [1.1.0] — 2026-10-20

Trust and security release, following an external benchmark against Figma Dev Mode.

### Security
- **Fixed: code injection through component mappings.** Mappings are stored in the Figma file. A crafted import path such as `./x';alert(1);//` was written into generated React code unescaped. Paths are now validated on save and when read from the file, and are emitted through a string-escaping helper.
- **Every UI → plugin message is validated** against a per-type schema:
  - unknown types are ignored and unknown fields dropped;
  - strings are capped and node ids checked;
  - enums and ranges are enforced (export format/scale, font upload size/type, http(s)-only links, whitelisted settings);
  - invalid input shows an error toast instead of reaching the Figma API.
- **Sandboxed preview:** the HTML preview iframe is `sandbox="allow-same-origin"` with no scripts, `referrerpolicy="no-referrer"`, plus a Content-Security-Policy. It allows no requests except Google Fonts, and none at all when preview fonts are off.

### Privacy
- **The plugin code makes no network requests.** Google Fonts detection uses a bundled catalog of ≈1,950 families, with weights, italics and variable ranges, instead of live lookups. Private, commercial and system font names can never be sent.
- New setting **⋯ → Load Google Fonts in preview** (on by default). Off = zero network traffic.
- Removed the on-device font-lookup cache (no longer needed).
- The manifest's network reasoning now describes exactly what is requested.

### Added
- **Before → after values in change tracking:** position, size, fill, stroke, radius, effects, layout/padding, font and text (first 80 characters). Includes colour swatches. Snapshots from 1.0 still work and show categories until **Mark as reviewed**.
- Variable Google Fonts weights (e.g. Space Grotesk 450) are linked exactly. Missing weights fall back to the nearest available one.
- **ESLint 10** (`npm run lint`), including the script inside `ui.html`. Fixed what it found: 4 unused functions, unbraced multi-line `if`s.
- **Browser tests** (`npm run test:browser`, Playwright): renders the panel in light/dark, and attacks the preview with a hostile document. A mutation run with the sandbox removed confirms the test catches it.
- **Repository layout check** (`npm run check:layout`, also part of `npm test`), so a mis-placed upload fails CI.
- `npm run verify` runs layout, sandbox, lint and tests. CI now runs lint and the browser tests, and the release job waits for both.
- New tests: zero network requests, bundled font catalog, 15 message-validation cases, mapping injection, before → after values. **65/65 checks.**

### Fixed
- The test runner now exits non-zero if it crashes, not only when a check fails.

## [1.0.0] — 2026-10-20

First public release.

### Added
- **Ready-for-dev gate.** Uses Figma's native status, or a DevReady flag where native status isn't available. Every status is labelled **Figma status** or **DevReady flag**. The gate is optional and can be turned off per user.
- **Dev Mode-style Inspect panel:**
  - header with the status and a change count;
  - overrides with "Compare with main component";
  - dev resources (GitHub/Storybook icons) and a Code Connect-style mapping;
  - component info and properties;
  - collapsible sections;
  - box-model diagram with a List/Code toggle and token chips;
  - colors, effects, variables with modes, interactions, layers, assets, export;
  - light and dark themes.
- **Code generation** for React + Tailwind, React + CSS, HTML + CSS, single-file HTML, SwiftUI and Jetpack Compose. Also works as a native Dev Mode codegen plugin.
- **Live preview:** side by side, overlay and difference against the Figma design.
- **Fonts:**
  - Google Fonts detection that links only the weights used;
  - `@font-face` for custom fonts, with optional file upload;
  - fallback stacks for every family.
- **Change tracking** since handoff.
- **Annotations** with categories and pinned properties. They are verified after writing, with a canvas-note fallback on plans without native annotations.
- **Test suite** (`npm test`):
  - 9 fixture designs × 6 targets, with output parsing and escaping checks;
  - change tracking under Figma's 100 kB limit;
  - offline fonts and network privacy.
- **CI workflow**, PRIVACY.md and the launch checklist.

### Fixed (found by the new test suite)
- Change-tracking snapshots of large frames (~1,000+ layers) went over Figma's 100 kB per-entry plugin-data limit, so "Start tracking" failed. Snapshots are now split into chunks. Frames over 2,500 layers are marked *partial* in the panel, instead of looking clean.
- SwiftUI strings with control characters produced `\u0007`, which isn't valid Swift. They now use `\u{7}`.
- Unicode bidi control characters ("Trojan Source") in design text are escaped in SwiftUI and Compose string literals.
- Figma's SES sandbox rejected `code.js` because of `<!--` / `eval(`-like text. Added `check-sandbox.js`.
