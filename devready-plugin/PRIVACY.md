# Privacy

DevReady is a local Figma plugin. It has no server, no account, no analytics and no telemetry.

## Network requests

The manifest allows exactly two domains (`networkAccess.allowedDomains`):

| Domain | Who calls it | What is sent | Why |
|---|---|---|---|
| `fonts.googleapis.com` | Plugin code (`code.js`) | A font **family name** and **weights/styles**, e.g. `css2?family=Inter:wght@500` | To check whether a font used in the design is on Google Fonts, so generated code can link it |
| `fonts.googleapis.com`, `fonts.gstatic.com` | The panel's live preview | The same font family/weight URL; your browser then downloads the font files | So the HTML preview shows the design's real font |

**Never sent:** layer names, text content, images, colors, variables, comments, file names, file keys, user names, or any other design data.

Like any web request, Google receives your IP address and a user agent. If that's not acceptable, block the domains or work offline. DevReady then falls back to a built-in list of popular Google fonts, and every font gets a system fallback stack.

Lookup results (font name → available weights) are cached on your device in Figma's `clientStorage`.

**Generated code:** HTML and React output contain a Google Fonts `<link>`/`@import` for Google-hosted fonts. When *you* open that code in a browser, the browser fetches the fonts from Google. Remove the link if you self-host fonts.

**How this is verified:** `npm test` includes a privacy check that:
- records every request the code engine makes;
- fails if a request goes to any host except Google Fonts, uses any query parameter except `family`, or contains design text;
- fails if `code.js` references other hosts or network APIs (XMLHttpRequest, WebSocket, sendBeacon).

## What DevReady stores

**In the Figma file** (shared plugin data, namespace `devready`). This is visible to anyone who can open the file, and readable by other plugins:

| Key | Stored on | Contents |
|---|---|---|
| `status`, `note`, `at` | The ready frame/section | Status type, the handoff note, and a timestamp. No user names. Only written when the DevReady flag is used instead of Figma's native status |
| `baseline:*` | The ready frame | Change-tracking snapshot: layer IDs, the first 40 characters of each layer name, and hashes of geometry/style/text. No text content or images. Split into chunks under Figma's 100 kB entry limit |
| `map:*` | File root | Component → code mappings you created (component name, import path) |
| dev resources | The layer | Links you added |
| redlines | Locked measurement layers on the page | Spacing labels you asked to draw (Design Mode only) |
| canvas notes | Locked note layers on the page | The annotation text you wrote, and the ID of the annotated layer |

**On your device only** (Figma `clientStorage`, not shared):
- Plugin settings: unit, language, gate on/off.
- Font-lookup cache.
- **Uploaded font files.** If you add custom fonts for the preview, they stay on your machine and are only embedded in code you export.

**Native Figma data** the plugin writes when you ask it to: Ready for dev status, annotations, measurements.

## Removing data

- **Change tracking:** clearing a frame's status removes its snapshot. **Mark as reviewed** replaces it with the current design.
- **Canvas notes:** ⋯ → Remove canvas notes on page.
- **Local data:** remove the plugin from Figma (Plugins → Manage plugins).

Questions: open an issue at https://github.com/Ankushui18/Dev-Ready/issues.
