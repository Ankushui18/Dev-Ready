# Licensing, in plain English

DevReady Inspect is licensed under the **PolyForm Noncommercial License 1.0.0**
(SPDX id `PolyForm-Noncommercial-1.0.0`), effective **4 November 2026**. The exact
terms are in [`LICENSE`](../LICENSE); the upstream text lives at
<https://polyformproject.org/licenses/noncommercial/1.0.0>. This file explains the
intent — it does not replace the licence, and it is not legal advice.

## In one line

**Free to use, study, modify and share for non-commercial purposes. Commercial use is
not permitted.**

This is a *source-available* licence, not an OSI-approved open-source licence. Please
do not describe the project as "open source" in listings, READMEs or marketing.

## What is allowed (permitted purposes)

Quoting the licence's own categories:

- **Any noncommercial purpose.**
- **Personal uses:** research, experiment and testing for the benefit of public
  knowledge, personal study, private entertainment, hobby projects, amateur pursuits
  or religious observance, without any anticipated commercial application.
- **Noncommercial organizations:** charitable organizations, educational institutions,
  public research organizations, public safety or health organizations, environmental
  protection organizations, and government institutions — regardless of how they are
  funded.
- Making changes and new works based on the plugin, and distributing copies, **for a
  permitted purpose**.
- Fair-use rights that the law gives you anyway.

## What is not allowed

The licence grants no rights for commercial purposes. In practice that means no:

- using or running DevReady at a for-profit company, startup or agency, including
  internal tooling and product development;
- freelance, contract or client work done for payment;
- bundling, reselling, sublicensing or hosting the plugin (or a modified version) as
  part of a paid product or service;
- selling copies of the plugin.

"Use" in the licence means *anything you do with the software requiring one of the
licences* — running the plugin counts, not just copying or modifying its source. The
licence also does not let you sublicense or transfer your rights to anyone else.

## Your designs and generated code

The licence covers the **DevReady plugin source**, not your Figma files, your brand
assets or the content of your designs — those remain yours and this repository claims
no ownership of them. Code generated *from your own designs* is output of the tool,
not a copy of the plugin; whether any particular use of that output is commercial is a
question about your work, not about the plugin's copyright. What this licence does
restrict is the act of **running the plugin** for a commercial purpose. If you need to
use DevReady in a commercial setting, that requires a separate permission from the
copyright holder; nothing in this repository grants it.

Generated projects can include a `fonts/` folder with fonts you uploaded. Those fonts
keep their own licences; DevReady does not relicense them.

## Notices you must pass on

PolyForm requires that anyone who receives a copy also receives these terms (or the
URL above) and any `Required Notice:` lines. This repository therefore ships:

- [`LICENSE`](../LICENSE) — the full canonical licence text;
- [`NOTICE`](../NOTICE) — `Required Notice: Copyright (c) 2026 Ankushui18`.

Keep both when redistributing. `scripts/zip.js` adds them to every release ZIP for the
same reason. Do not delete the copyright notice.

## Why MIT disappeared, and what it means for old copies

Releases up to and including **v1.5.1** were published under the MIT License, which
allowed commercial use. An MIT grant is **irrevocable**: anyone who obtained those
copies may continue using, modifying and selling them under MIT, and forks based on
those tags can stay MIT. Changing `LICENSE` applies only to the source from this commit
onward — it cannot retroactively withdraw rights already granted.

Two related caveats for the maintainer:

- **Third-party contributions.** Relicensing code contributed by other people usually
  requires their consent (or a CLA). Check the contributor history before treating the
  whole tree as freely relicensable; if in doubt, get advice.
- **Selling commercial rights is still possible for you.** As the copyright holder of
  your own code you are not bound by the licence you grant to others, so you may offer
  separate paid/commercial licences (dual licensing) or sell a commercial edition. The
  public repository does **not** grant any such rights; that would be a separate written
  agreement. Have a lawyer draft it, especially if third-party code is involved.
- **Figma Community.** Publishing a plugin grants Figma distribution rights under its
  then-current terms. A non-commercial licence may conflict with those terms or with a
  paid Community listing. Review them before submitting, and state the restriction in
  the listing. See [`LAUNCH.md`](LAUNCH.md).

## Where the licence is stated

| Place | Value |
|---|---|
| `LICENSE` | Canonical PolyForm Noncommercial 1.0.0 text |
| `NOTICE` | Required copyright notice + licence URL + MIT history |
| `package.json`, `package-lock.json` | `PolyForm-Noncommercial-1.0.0` |
| `README.md` badge + License section | Non-commercial only |
| `docs/index.html` (website) | Licence section + `license` in JSON-LD |
| Release ZIP | `LICENSE` and `NOTICE` at the ZIP root |
| `docs/FAQ.md`, `docs/LAUNCH.md`, `docs/GITHUB_SETUP.md` | Consistent wording |

GitHub's licence detector may show this as **"Other"** instead of naming PolyForm; that
is a GitHub UI limitation, not a licensing problem. The `LICENSE` file is authoritative.
