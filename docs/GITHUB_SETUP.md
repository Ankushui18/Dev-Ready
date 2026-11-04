# GitHub setup

Settings that live on GitHub rather than in the repository, plus the one mistake that
has already broken this repository once. About 5 minutes to do.

## 1. Repository layout (fixed in v1.2.0 — keep it this way)

**What went wrong before:** the files were uploaded through GitHub's web UI and
everything landed **inside** `devready-plugin/` — README, LICENSE, docs, tests, and a
second copy of the plugin in `devready-plugin/devready-plugin/`. The visible effects
were: no README on the repo page, no license in the sidebar, CI never ran, and
`npm test` could not work from a fresh clone. Two copies of the plugin also drifted,
so the folder Figma imports was the *older* one.

**What it is now** (what `npm run check:layout` enforces):

```
Dev-Ready/                     ← repository root
├── .github/                   ← CI + issue templates (hidden folder!)
├── .gitignore                 ← hidden file!
├── README.md  LICENSE  PRIVACY.md  SECURITY.md  CHANGELOG.md  CONTRIBUTING.md
├── package.json  package-lock.json  eslint.config.js
├── docs/  scripts/  tests/
└── devready-plugin/           ← ONLY what Figma loads
    ├── manifest.json
    ├── code.js
    ├── ui.html
    ├── README.md              (full feature documentation)
    └── check-sandbox.js
```

Verify any time:

```bash
npm ci
npm run check:layout    # must print "layout OK"
npm run verify          # layout + sandbox + lint + 144 checks
```

> ⚠️ **Never use GitHub's web "Add file → Upload files" for a folder.** Dragging a
> folder there silently drops hidden folders (`.github`, `.gitignore`) and it is easy
> to drop everything into the wrong directory. That is exactly how this repo broke.
> Use git, GitHub Desktop, or CI.

### If it happens again

From a correct copy of the repository on disk:

```bash
git rm -r -q .                 # stop tracking the mis-placed files
cp -R /path/to/correct/Dev-Ready/. .   # the "/." copies hidden files too
npm ci && npm run verify       # ends with "layout OK" … "all passed"
git add -A && git status       # .github/, tests/, scripts/ at root; plugin folder has 5 files
git commit -m "Restore repository layout"
git push
```

On Windows PowerShell, use `robocopy ..\Dev-Ready . /E /XD node_modules` (exit code 1
means success) instead of `cp`. In GitHub Desktop: **Repository → Show in
Finder/Explorer**, delete everything except `.git`, then copy the *contents* in; press
<kbd>⌘</kbd><kbd>⇧</kbd><kbd>.</kbd> (macOS) or enable hidden items (Windows) first.

**Check it worked:** the repo page shows the README with the cover image and a
**PolyForm Noncommercial 1.0.0** license badge, the **Actions** tab has a green run
with *Test* and *Browser* jobs, and `devready-plugin/` contains only five files.

## 2. "About" box

**Fast path:** run `./scripts/setup-github-meta.sh` from your own machine (with
`gh auth login`). It applies everything in sections 2 and 3 — description, topics,
website and GitHub Pages — through the GitHub API. It needs a token with
**Administration** and **Pages** write permissions; CI/App tokens usually get a 403.
The values below are the same ones, for doing it by hand.

**By hand:** click ⚙️ next to **About** on the repository page.

**Description** (this is what Google shows under the GitHub result — keep the exact
phrase *Figma Dev Mode* in it):
> Free Figma Dev Mode alternative plugin: Dev Mode-style inspect, design handoff, design tokens, WCAG accessibility checks and design-to-code in 12 targets (React, Vue, Svelte, SwiftUI, Compose, Flutter). Ready for dev gate. Non-commercial use.

**Website:** `https://ankushui18.github.io/Dev-Ready/` (the GitHub Pages landing page).
Replace it with the Figma Community URL once the listing is live, or keep both by
linking the Community page from the landing page.

**Topics** (GitHub search, topic pages and related-repo suggestions all use these):
```
figma  figma-plugin  figma-dev-mode  dev-mode  figma-inspect  design-handoff
design-to-code  figma-to-code  design-tokens  figma-variables  codegen  react
tailwindcss  vue  svelte  swiftui  jetpack-compose  flutter  accessibility
non-commercial
```
Re-apply them here (or re-run the script) if you ever reset the repo settings.
See [SEO.md](SEO.md) for why each field matters.

Tick **Releases**; untick **Packages** and **Deployments**.

## 3. Social preview & website (GitHub Pages)

**Settings → General → Social preview → Edit → Upload** `docs/brand/social-1280x640.png`.
That's the card shown when the link is shared on X, LinkedIn or Slack. GitHub has no API
for this upload, so it is a one-time manual step.

**Settings → Pages → Build and deployment → Deploy from a branch**, choose the branch
that holds `docs/index.html` and the `/docs` folder. The landing page, `sitemap.xml`,
`robots.txt` and `.nojekyll` all live in `docs/`; no build step is needed. The site is
served at `https://ankushui18.github.io/Dev-Ready/`.

> If the site is published from a feature branch for a preview, switch the source to
> `main` after merging, or the site disappears when that branch is deleted.

After the site is live, submit `https://ankushui18.github.io/Dev-Ready/sitemap.xml` in
Google Search Console. A project Pages site cannot own the host-level `/robots.txt`, so
submitting the sitemap is what actually gets the page crawled. Full checklist:
[SEO.md](SEO.md).

## 4. Issues

**Settings → Features:** turn on **Issues** and **Discussions**. The templates in
`.github/ISSUE_TEMPLATE/` appear under **New issue** and ask for the environment
(Design Mode / Dev Mode / Code section / VS Code) and the code target, which are the
two details a bug report needs.

## 5. First release

CI builds `devready-plugin.zip` and attaches it to the release when you push a tag:

```bash
git tag v1.2.0
git push origin v1.2.0
```

The `release` job waits for *Test* and *Browser*, then creates the GitHub Release.
Paste the matching `CHANGELOG.md` section into the release notes.

After that, users install straight from **Releases** — unzip, then **Plugins →
Development → Import plugin from manifest…** → pick `devready-plugin/manifest.json`.

## 6. Nice to have

- **Security → Private vulnerability reporting:** enable it ([SECURITY.md](../SECURITY.md) points there).
- **Pin the repo** on your profile.
- Once the Community listing is live, add the link to the README top line and the
  About website field.
