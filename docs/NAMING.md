# Naming

The product is a **free Figma plugin**: a Dev Mode-style inspector plus a
"ready for dev" handoff gate. Today it carries two names:

| Where | Name |
|---|---|
| GitHub repository | `Dev-Ready` |
| Plugin inside Figma | `DevReady Inspect` |

## The actual problem with the current name

`Dev-Ready` reads like an adjective, so on a repository page it sounds like
*"a repository that is ready for development"* rather than *"a handoff tool about
being ready for dev"*. The hyphen adds to it. The plugin name is better
(`DevReady Inspect`), but it duplicates the phrase Figma uses for a **status**
("Ready for dev"), which makes searching ambiguous: the product name and the
feature name are the same words.

Two smaller issues:

- `DevReady` is close to several existing tools, so it is hard to search for.
- The gate is only *half* the product — the other half is a free inspector and
  ten code targets. A name that only says "ready" undersells it and confuses
  people who don't use a handoff process.

## Options, with trade-offs

Checked for npm/GitHub collisions in October 2026; always re-check the Figma
Community, npm and trademarks before committing.

### A. Keep the name, fix the framing — **lowest cost, recommended if you want to ship now**

- Repo: `Dev-Ready`; plugin: **DevReady Inspect**.
- Add a tagline that carries the meaning: *"Dev Mode-style inspect and code, unlocked
  when a design is ready for dev."*
- Why: every rename means a second Figma listing later, broken links, and confusion
  for the few people already using it. The current plugin name is descriptive and
  already appears in ten codegen labels (`DevReady · React + Tailwind`), the manifest,
  screenshots, and the ZIP.
- Only fix the repository's **About** description and topics so search works
  ([GITHUB_SETUP.md](GITHUB_SETUP.md#2-about-box)).

### B. Rename the plugin, keep the repo — **clear win, medium cost**

- **DevSpec** — instantly understood as "design specs for developers"; works for the
  inspector and the codegen. Downside: common word, ~97 GitHub repos use it, and the
  npm name is taken (that's fine — you are not publishing an npm package).
- **Handoff Kit** — says handoff and implies a toolkit (inspector + code + assets).
  `handoffkit` is free on npm and only ~12 GitHub repositories use it. Downside:
  "handoff" excludes teams that use it as a plain inspector.
- **Specsheet** — evokes a spec document, memorable, free on npm, 66 GitHub repos.
  Downside: sounds like an export format, not a panel.

### C. Rename around the gate — **strong product story, highest cost**

- **Readymark** — "the mark that says ready". Short, ownable, free on npm, only 3
  GitHub repositories. Downside: invented words need explaining once.
- **Signoff** — the handoff moment; excellent verb use ("sign off this frame").
  Downside: very crowded (415 GitHub repos, npm taken), and it implies approval
  workflows, which the plugin only partly does.
- **Greenlight** — same appeal as Signoff, warmer. Downside: heavily used in other
  categories.

### D. Rename around what developers get

- **Redline** — the classic design-handoff term for measurements and specs.
  Instantly understood by designers. Downside: used by several tools and an npm
  package; also implies *only* measurement, not code generation.

## Recommendation

1. **Now:** keep `DevReady Inspect`, but stop using `Dev-Ready` as the headline in
   prose. Write **DevReady** everywhere, and put the descriptive tagline directly
   under it (already done in the root README). Fix the GitHub About box and topics.
2. **If you want a memorable, ownable name before publishing to Community:**
   **Handoff Kit** for the product, with "DevReady Inspect" kept as the panel's name
   inside the plugin. It is free on npm, rare on GitHub, and describes inspector +
   code + assets without implying a paid plan.
3. **Avoid** renaming to another gate-only word (Signoff, Greenlight): the gate is
   optional and the plugin is useful without it.

Whatever you pick, one rule: **the plugin name inside Figma is the brand.** The
repository name is only a URL.

## Rename checklist

If you do rename, these are all the places that carry the name:

```bash
grep -rn "DevReady\|Dev-Ready\|devready" --include='*.md' --include='*.json' --include='*.js' --include='*.html' . \
  | grep -v node_modules
```

- `devready-plugin/manifest.json` → `"name"` (this is what Figma shows) and every
  `codegenLanguages[].label` (`DevReady · React + Tailwind`, …).
- `package.json` → `"name"`, `"description"`, bad URLs.
- `README.md`, `devready-plugin/README.md`, `docs/*.md`, `CHANGELOG.md`,
  `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`.
- `devready-plugin/ui.html` → header text, `<title>`, demo data copy.
- `devready-plugin/code.js` → toasts and generated file headers/comments.
- `tests/*.js` → any test asserting the name (search before assuming).
- **Do not rename the shared plugin data namespace** (`const NS = 'devready'`).
  Changing it makes every existing file look unmarked and drops saved baselines and
  mappings. The namespace is an internal identifier, not branding.
- GitHub: repository name, About description, topics, social preview, release ZIP
  name (`scripts/zip.js`), and the Community listing if it exists.
- After the Figma Community listing exists, the plugin name is **not** freely
  renameable — decide before publishing.
