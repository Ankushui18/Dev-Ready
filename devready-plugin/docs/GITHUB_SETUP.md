# GitHub setup (one-time)

These settings live on GitHub, not in the repo, so they can't be committed. They take about 5 minutes.

## 1. Fixing a mis-placed upload (do this first)

**Current state of github.com/Ankushui18/Dev-Ready (checked Oct 2026):**
- `README.md`, `LICENSE`, `PRIVACY.md`, `docs/` and the rest were uploaded **inside** `devready-plugin/` instead of at the top level.
- `tests/`, `scripts/`, `.github/` (CI) and `.gitignore` are **missing**.

That's why the repo page shows no README or license, CI never runs, and `npm test` can't work from a fresh clone.

**Target layout** (what `npm run check:layout` verifies):

```
Dev-Ready/                ← repository root
├── .github/              ← CI + issue templates (hidden folder!)
├── .gitignore            ← hidden file!
├── README.md  LICENSE  PRIVACY.md  SECURITY.md  CHANGELOG.md  CONTRIBUTING.md
├── package.json  package-lock.json  eslint.config.js
├── docs/  scripts/  tests/
└── devready-plugin/      ← ONLY the plugin: manifest.json, code.js, ui.html, README.md, check-sandbox.js
```

> ⚠️ **Don't use GitHub's web "Add file → Upload files" for this.** Dragging a folder there drops hidden folders like `.github`, and it's easy to drop everything into the wrong folder. That's what happened here. Use git or GitHub Desktop.

### Option A — git on the command line (recommended, ~2 minutes)

Unzip `Dev-Ready-v1.1.0.zip` next to where you'll clone, so you have a `Dev-Ready/` folder. Then:

**macOS / Linux**
```bash
git clone https://github.com/Ankushui18/Dev-Ready.git Dev-Ready-repo
cd Dev-Ready-repo
git rm -r -q .                 # remove everything currently tracked (the mis-placed files)
cp -R ../Dev-Ready/. .         # the "/." also copies hidden files (.github, .gitignore)
npm ci && npm run verify       # must end with "layout OK" … "all passed"
git add -A
git status                     # .github/, tests/, scripts/ at the top; devready-plugin/ has 5 files
git commit -m "Fix repository layout; v1.1.0"
git push
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/Ankushui18/Dev-Ready.git Dev-Ready-repo
cd Dev-Ready-repo
git rm -r -q .
robocopy ..\Dev-Ready . /E /XD node_modules   # copies hidden files too; exit code 1 = success
npm ci; npm run verify
git add -A; git status
git commit -m "Fix repository layout; v1.1.0"
git push
```

### Option B — GitHub Desktop

1. **File → Clone repository → Ankushui18/Dev-Ready.** Then **Repository → Show in Finder/Explorer**.
2. In that folder, delete everything **except** the hidden `.git` folder.
3. Copy the **contents** of the unzipped `Dev-Ready/` folder into it, not the folder itself. On macOS press **⌘ ⇧ .** in Finder to show hidden files, so `.github` and `.gitignore` come along. On Windows, enable **View → Hidden items**.
4. Back in GitHub Desktop, the summary should show the root files *moved* out of `devready-plugin/`, and `tests/`, `scripts/` and `.github/` added. Commit "Fix repository layout; v1.1.0" → **Push origin**.

### Check it worked
- The repo page shows the README with the cover image, and **MIT license** in the sidebar.
- The **Actions** tab shows a CI run with *test* and *browser* jobs, both green.
- `devready-plugin/` on GitHub contains only `manifest.json`, `code.js`, `ui.html`, `README.md` and `check-sandbox.js`.

## 1b. Later updates

From your clone: copy changed files in, run `npm run verify`, then `git add -A && git commit -m "…" && git push`.

## 2. "About" box

On the repo page, click the ⚙️ next to **About**.

**Description:**
> Free Figma plugin: Dev Mode-style inspect, change tracking and design-to-code (React, Tailwind, HTML, SwiftUI, Compose), gated on Ready for dev.

**Website:** leave empty until the Community listing exists, then paste its URL.

**Topics:**
```
figma  figma-plugin  dev-mode  design-handoff  design-to-code  design-tokens  react  tailwindcss  swiftui  jetpack-compose  codegen  open-source
```

Tick **Releases** and untick **Packages** and **Deployments**.

## 3. Social preview

**Settings → General → Social preview → Edit → Upload** `docs/brand/social-1280x640.png`.

This is the image shown when the repo link is shared on X, LinkedIn or Slack.

## 4. First release

```bash
git tag v1.1.0
git push origin v1.1.0
```

The CI workflow runs the tests and browser checks, then creates a GitHub Release with `devready-plugin.zip` attached. Paste the `1.1.0` section of `CHANGELOG.md` into the release notes.

From then on, users install by downloading that ZIP from **Releases**, with no need to clone.

## 5. Nice to have

- **Settings → Features:** turn on Issues and Discussions (for Q&A).
- **Security → Private vulnerability reporting:** enable it (SECURITY.md points there).
- **Pin the repo** on your GitHub profile.
- After the Community listing is live, add its link to the README top line and the About website field.
