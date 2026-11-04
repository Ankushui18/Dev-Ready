#!/usr/bin/env bash
# Applies the GitHub-side SEO settings that are NOT stored in git:
#   About description · topics · website · social-preview reminder · GitHub Pages.
#
# Why this exists: GitHub repo settings are not files. CI tokens (and the Arena
# GitHub App token) can push commits but usually cannot edit repository metadata;
# these calls need a token with repository administration rights.
#
# Usage (from your own machine, with `gh auth login` already done):
#   ./scripts/setup-github-meta.sh
#   PAGES_BRANCH=arena/07ea7b16-dev-ready ./scripts/setup-github-meta.sh   # preview from a branch
#
# After merging to main, re-run with PAGES_BRANCH=main (the default) so the site
# does not disappear when a feature branch is deleted.
set -euo pipefail

REPO="${REPO:-Ankushui18/Dev-Ready}"
BRANCH="${PAGES_BRANCH:-main}"
SITE="https://ankushui18.github.io/Dev-Ready/"

DESCRIPTION="Free Figma Dev Mode alternative plugin: Dev Mode-style inspect, design handoff, design tokens, WCAG accessibility checks and design-to-code in 12 targets (React, Vue, Svelte, SwiftUI, Compose, Flutter). Ready for dev gate. Non-commercial use."

TOPICS='{"names":["figma","figma-plugin","figma-dev-mode","dev-mode","figma-inspect","design-handoff","design-to-code","figma-to-code","design-tokens","figma-variables","codegen","react","tailwindcss","vue","svelte","swiftui","jetpack-compose","flutter","accessibility","non-commercial"]}'

command -v gh >/dev/null || { echo "Install the GitHub CLI: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }

echo "→ Setting About description and website on $REPO"
gh api -X PATCH "repos/$REPO" \
  -f description="$DESCRIPTION" \
  -f homepage="$SITE" >/dev/null

echo "→ Setting 20 topics"
printf '%s' "$TOPICS" | gh api -X PUT "repos/$REPO/topics" --input - >/dev/null

if ! gh api "repos/$REPO/contents/docs/index.html?ref=$BRANCH" >/dev/null 2>&1; then
  echo "WARNING: $BRANCH has no docs/index.html yet. Merge this change first, or set" >&2
  echo "         PAGES_BRANCH to the branch that contains it." >&2
fi

echo "→ Enabling GitHub Pages from $BRANCH /docs"
PAGES_SOURCE="{\"build_type\":\"legacy\",\"source\":{\"branch\":\"$BRANCH\",\"path\":\"/docs\"}}"
if gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  printf '%s' "$PAGES_SOURCE" | gh api -X PUT "repos/$REPO/pages" --input - >/dev/null
else
  printf '%s' "$PAGES_SOURCE" | gh api -X POST "repos/$REPO/pages" --input - >/dev/null
fi

echo
echo "Done. Verify with:"
echo "  gh repo view $REPO --json description,homepageUrl,repositoryTopics"
echo "  curl -I $SITE"
echo
echo "Manual step GitHub has no API for:"
echo "  Settings → General → Social preview → upload docs/brand/social-1280x640.png"
echo "Then submit ${SITE}sitemap.xml in Google Search Console (see docs/SEO.md)."
