# SEO & discoverability

Why a Google search for the project name (even with `figma dev mode` or `git` added)
returned nothing, what was changed, and the short list of manual steps that actually
get a new project indexed.

## 1. The diagnosis

Checked against the live GitHub repository on 4 November 2026:

| Problem | Effect on search |
|---|---|
| **Repo description was empty** | Google and GitHub's own search had no summary to show for `Ankushui18/Dev-Ready`. The "About" text is the single most visible field in a GitHub result. |
| **Zero topics** | No presence on GitHub topic pages (`/topics/figma-plugin`), no "related repositories", no discovery through GitHub search. |
| **No website / homepage** | No crawlable HTML page existed anywhere. GitHub renders the README, but a repo page alone is a thin, generic result with no title tag, meta description or structured data you control. |
| **No social preview** | Shared links showed GitHub's default card, so no click-through signal. |
| **README never used the phrases people type** | It said "a free, open-source Figma plugin for design handoff" and "Inspect specs like Dev Mode". Nobody searching *free Figma Dev Mode alternative*, *Figma Dev Mode plugin* or *figma to code git* would match a page whose headings are `DevReady` and `What is this, in one paragraph`. |
| **The name is ambiguous** | `Dev-Ready` reads as "a repo that is ready for dev". The plugin is actually called `DevReady Inspect`. See [NAMING.md](NAMING.md). |
| **No backlinks yet** | A new repo with no inbound links and no published site has little reason for Google to crawl it quickly. Even a perfect setup takes days to weeks. |

So this was not a single bug: the repo simply had no search surface. Everything below
adds one.

## 2. What changed

**GitHub settings** (these live in GitHub, not in git — run
`./scripts/setup-github-meta.sh` once with your own `gh auth login` to apply all of
them; the Arena/CI token can push code but gets `403 Resource not accessible by
integration` on repository settings). The script needs a token with **Administration**
and **Pages** write permissions:

- **Description:** "Free Figma Dev Mode alternative plugin: Dev Mode-style inspect, design handoff, design tokens, WCAG accessibility checks and design-to-code in 12 targets (React, Vue, Svelte, SwiftUI, Compose, Flutter). Ready for dev gate. Non-commercial use."
- **Topics (20, GitHub's maximum):** `figma`, `figma-plugin`, `figma-dev-mode`, `dev-mode`, `figma-inspect`, `design-handoff`, `design-to-code`, `figma-to-code`, `design-tokens`, `figma-variables`, `codegen`, `react`, `tailwindcss`, `vue`, `svelte`, `swiftui`, `jetpack-compose`, `flutter`, `accessibility`, `non-commercial`.
- **Website:** `https://ankushui18.github.io/Dev-Ready/`.

**In the repository:**

- `README.md` — keyword-bearing H1 (`DevReady Inspect`), cover `alt` text and opening
  paragraph; a new **"Is this a free Figma Dev Mode alternative?"** section with a
  Dev Mode comparison table; the searched phrases written out once, naturally; links
  to this file and the licensing notes.
- `docs/index.html` — a real HTML landing page for GitHub Pages with a title tag,
  meta description, canonical URL, Open Graph/Twitter cards, `SoftwareApplication` and
  `FAQPage` JSON-LD, a comparison table, install steps, 6 FAQ answers and real
  screenshots. This is the page Google can actually index.
- `docs/sitemap.xml`, `docs/robots.txt`, `docs/.nojekyll` — sitemap with image tags,
  crawler directives, and a marker so Pages serves the HTML as-is instead of running
  Jekyll over the docs folder.
- `docs/GITHUB_SETUP.md` — the same description/topics/Pages/social-preview settings
  written down, so they survive a repo reset.
- `docs/LAUNCH.md` — the Figma Community tagline now contains "free Figma Dev Mode
  alternative", which is what people search inside Figma Community too.
- `devready-plugin/manifest.json` — unchanged; Figma has no description field in the
  manifest. The Community *listing* copy in `LAUNCH.md` is the search surface there.

## 3. Target search phrases

Primary (in the page title, H1, repo description and meta description):

- `free Figma Dev Mode alternative`
- `Figma Dev Mode alternative plugin`
- `free Figma Dev Mode plugin`
- `DevReady Inspect` / `DevReady Figma plugin` / `Dev-Ready GitHub`

Secondary (in headings, comparison table, FAQ and topics):

- `Figma inspect plugin`, `Figma design handoff tool`
- `Figma to code`, `design-to-code`, `Figma codegen`
- `Figma design tokens export`, `Figma variables to CSS`
- `Ready for dev plugin`, `Figma handoff gate`
- `Figma to React / Vue / Svelte / SwiftUI / Jetpack Compose / Flutter`
- `Figma accessibility contrast check`, `WCAG Figma plugin`

Do **not** paste these into a keyword-stuffed paragraph or hidden text. Google ignores
meta keywords and penalises hidden text; the phrases are placed in real headings,
tables and answers instead.

## 4. Setup checklist

- [ ] **Run `./scripts/setup-github-meta.sh`** from your own machine. It sets the
      description, 20 topics, the website field and GitHub Pages (`main` / `/docs`)
      in one command. For an immediate preview from the current feature branch use
      `PAGES_BRANCH=arena/07ea7b16-dev-ready ./scripts/setup-github-meta.sh`, then
      re-run with `PAGES_BRANCH=main` after merging.
- [ ] **Upload the social preview.** Settings → General → Social preview → Edit →
      upload `docs/brand/social-1280x640.png`. GitHub has no API for this.
- [ ] **Confirm Pages** (the script does this; manual equivalent: Settings → Pages → "Deploy from a branch" → branch containing
      `docs/index.html`, folder `/docs`. Visit
      <https://ankushui18.github.io/Dev-Ready/> and check the images load.
      If the site is published from a feature branch for a preview, switch it to
      `main` after merging, or the site breaks when that branch is deleted.)
- [ ] **Verify the domain and submit the sitemap** in
      [Google Search Console](https://search.google.com/search-console): add the URL
      prefix `https://ankushui18.github.io/Dev-Ready/`, then submit
      `https://ankushui18.github.io/Dev-Ready/sitemap.xml` and use *URL Inspection →
      Request indexing* on `/Dev-Ready/`.
      A GitHub Pages **project** site cannot own the host-level `/robots.txt`, which
      is why `docs/robots.txt` is a hint and Search Console is the real mechanism.
- [ ] **Bing Webmaster Tools**: import the sitemap from Google Search Console.
- [ ] **Validate structured data** with Google's Rich Results Test and
      <https://validator.schema.org/> for the two JSON-LD blocks.
- [ ] **Add inbound links** (this matters more than any on-page tweak): pin the repo
      on your GitHub profile, link it from your profile README, put the site URL in
      the Figma Community listing once published, and post once in a relevant place
      (Figma forum, r/FigmaDesign, a DEV/Hashnode write-up, an `awesome-figma` list).
      One genuine link beats twenty directory submissions.
- [ ] **Keep it consistent.** If you rename the project, follow
      [NAMING.md](NAMING.md), update the canonical URL, sitemap, homepage field and
      JSON-LD together, and keep the `LICENSE`/social-preview settings in sync.

## 5. How to check that it worked

```text
site:github.com/Ankushui18/Dev-Ready
site:ankushui18.github.io/Dev-Ready
"DevReady Inspect" "Figma Dev Mode"
"free Figma Dev Mode alternative" plugin
```

Also useful: `curl -I https://ankushui18.github.io/Dev-Ready/` (expect `200`), and
GitHub's own search (`repo:Ankushui18/Dev-Ready`, or the topic pages
<https://github.com/topics/figma-dev-mode>) which usually updates within minutes.

**Be patient.** A brand-new Pages site with no backlinks commonly takes a few days to
several weeks to appear, and Google never guarantees inclusion. The repo description
and topics show up in GitHub search immediately; the rest is a waiting game plus the
backlinks above. If after 3–4 weeks `site:` still shows nothing, check Search Console
for crawl errors and confirm the Pages build succeeded under the repo's Actions /
Pages settings.

## 6. What not to expect

- Adding `meta keywords`, hidden keyword lists or a second "SEO page" full of repeated
  phrases will not help and can hurt.
- GitHub repo pages are indexed, but you cannot add meta tags or structured data to
  them — that is exactly why the Pages landing page exists.
- Renaming the repository would give a cleaner name but breaks existing links and
  Figma's plugin id; the framing fix above is the low-risk option.
- A non-commercial licence can reduce sharing (companies, package mirrors and
  "awesome" lists sometimes skip non-commercial tools). See [LICENSING.md](LICENSING.md)
  for the trade-off and the option of selling separate commercial licences.
