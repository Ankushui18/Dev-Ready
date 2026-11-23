# Contributing

Thanks for helping. Bug reports with a reproducible design are the most valuable contribution.

## Reporting a bug

Use **Issues → New issue → Bug report**. The most useful details are:
- where it happened: Design Mode, Dev Mode Inspect, Dev Mode Code section, or Figma for VS Code;
- the code target, if relevant;
- a screenshot of the layer and its layer tree, or a small Community file that reproduces it.

## Before you start

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — what lives where in `code.js` and
  `ui.html`, the message protocol, and where to change what. Read this first; the two
  source files are large single files by design (no build step).
- [docs/FAQ.md](docs/FAQ.md) — behaviour that is Figma's limitation rather than a bug.
- [PRIVACY.md](PRIVACY.md) / [SECURITY.md](SECURITY.md) — the rules the tests enforce.

## Development

The repository tooling needs Node 20.19+ on 20.x, 22.13+ on 22.x, or 24+ (Node 24+ is recommended); these ranges match ESLint 10. The plugin itself does not need Node to run in Figma.

```bash
git clone https://github.com/Ankushui18/Dev-Ready.git
cd Dev-Ready
npm ci
npm run verify  # layout + Figma sandbox check + ESLint + 165 checks (what CI runs)
npm test        # just the Node suite
```

The separate browser suite also needs Python Playwright and Chromium:

```bash
python -m pip install -r tests/requirements-browser.txt
python -m playwright install chromium
npm run test:browser
```

It runs axe contrast checks on representative panel states, checks placeholders and keyboard/preflight behaviour, and tests preview isolation. It excludes design-colour samples and generated previews and does not replace testing in Figma or with a screen reader. By default it uses Playwright's Chromium; `DEVREADY_TEST_CHROMIUM=/path/to/chromium` optionally selects another executable, which may not match Playwright's supported version.

Load the plugin in the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and pick `devready-plugin/manifest.json`. After you edit `code.js` or `ui.html`, re-run the plugin. You only need to re-import if `manifest.json` changed.

`devready-plugin/ui.html` also opens directly in a browser with sample data. That's the fastest way to work on the UI.

## Rules of thumb

- **No build step.** `code.js` and `ui.html` are what Figma loads. Keep them dependency-free.
- **Keep the layout.** `devready-plugin/` holds only what Figma loads. Root files
  (docs, tests, CI) stay at the root — `npm run check:layout` enforces it, because a
  mis-placed upload is how this repository broke once. Always add files with git, never
  with GitHub's web uploader.
- **Figma's sandbox rejects some source text,** even inside comments and strings: `import(`, `eval(`, `<!--`, `-->`. `npm run check` catches these.
- **Escape everything that comes from the design** (layer names, text, URLs) for the target language. Add a case to the `hostile-content` fixture when you add an output path.
- **Fixing a code-generation bug?** Add or extend a fixture in `tests/fixtures.js` first, so it stays fixed.
- **Keep the panel honest.** If a result is partial or approximate, say so in the UI.
- **Adding a message type?** Schema in `MSG_SCHEMA` first, then the `case`, then an
  attack case in `tests/run.js`.
- **Change the snapshot format?** Old baselines must keep working — there is a test
  for that.
- **UI changes:** open `devready-plugin/ui.html` in a browser (demo data) and check
  light and dark before opening Figma.

## Releasing

1. Update `CHANGELOG.md`, `package.json`, `package-lock.json`, the README status and the website's `softwareVersion`. Call out licence or compatibility changes prominently.
2. Refresh `docs/test-report.md` with `npm test -- --report` if the Node suite changes; run `npm run verify` and the browser suite. Document any manual-testing gaps.
3. Merge the release changes. Build and inspect an archive from the resulting commit with `npm run zip`; it must contain the plugin, `LICENSE` and `NOTICE`.
4. Tag that commit (for example, `git tag -a vX.Y.Z <commit> -m "Release vX.Y.Z"` and `git push origin vX.Y.Z`). Tag-triggered CI runs the checks, builds the ZIP and creates the GitHub release using the matching changelog section.
5. Verify the release notes, tag, downloadable ZIP and CI result. If a release already exists, CI preserves its notes and ZIP, and only uploads the ZIP when missing.
