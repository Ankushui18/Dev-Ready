# Contributing

Thanks for helping. Bug reports with a reproducible design are the most valuable contribution.

## Reporting a bug

Use **Issues → New issue → Bug report**. The most useful details are:
- where it happened: Design Mode, Dev Mode Inspect, Dev Mode Code section, or Figma for VS Code;
- the code target, if relevant;
- a screenshot of the layer and its layer tree, or a small Community file that reproduces it.

## Development

```bash
git clone https://github.com/Ankushui18/Dev-Ready.git
cd Dev-Ready
npm install
npm test        # code-generation fixtures, escaping, privacy, change tracking
npm run check   # Figma SES sandbox check for code.js
```

Load the plugin in the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and pick `devready-plugin/manifest.json`. After you edit `code.js` or `ui.html`, re-run the plugin. You only need to re-import if `manifest.json` changed.

`devready-plugin/ui.html` also opens directly in a browser with sample data. That's the fastest way to work on the UI.

## Rules of thumb

- **No build step.** `code.js` and `ui.html` are what Figma loads. Keep them dependency-free.
- **Figma's sandbox rejects some source text,** even inside comments and strings: `import(`, `eval(`, `<!--`, `-->`. `npm run check` catches these.
- **Escape everything that comes from the design** (layer names, text, URLs) for the target language. Add a case to the `hostile-content` fixture when you add an output path.
- **Fixing a code-generation bug?** Add or extend a fixture in `tests/fixtures.js` first, so it stays fixed.
- **Keep the panel honest.** If a result is partial or approximate, say so in the UI.

## Releasing

1. Update `CHANGELOG.md` and the `version` in `package.json`.
2. Run `npm test -- --report` to refresh `docs/test-report.md`.
3. Tag the release: `git tag v1.x.y && git push --tags`.
4. Create a GitHub release and attach `devready-plugin.zip`.
