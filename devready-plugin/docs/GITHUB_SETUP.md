# GitHub setup (one-time)

These settings live on GitHub, not in the repo, so they can't be committed. They take about 5 minutes.

## 1. Push these files

From the folder that contains `README.md`, `LICENSE` and `devready-plugin/`:

```bash
git init                      # skip if you cloned the repo
git remote add origin https://github.com/Ankushui18/Dev-Ready.git   # skip if already set
git add .
git commit -m "v1.0.0: tests, CI, privacy policy, docs, change-tracking fix"
git branch -M main
git push -u origin main
```

If GitHub rejects the push because the remote has your earlier commit, run `git pull --rebase origin main` first. (Or clone the repo, copy these files into it, and commit.)

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
git tag v1.0.0
git push origin v1.0.0
```

The CI workflow runs the tests, then creates a GitHub Release with `devready-plugin.zip` attached. Paste the `1.0.0` section of `CHANGELOG.md` into the release notes.

From then on, users install by downloading that ZIP from **Releases**, with no need to clone.

## 5. Nice to have

- **Settings → Features:** turn on Issues and Discussions (for Q&A).
- **Security → Private vulnerability reporting:** enable it (SECURITY.md points there).
- **Pin the repo** on your GitHub profile.
- After the Community listing is live, add its link to the README top line and the About website field.
