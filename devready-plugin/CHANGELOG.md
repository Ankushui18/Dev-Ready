# Changelog

All notable changes to DevReady are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [SemVer](https://semver.org/).

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
