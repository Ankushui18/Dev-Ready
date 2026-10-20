# Security

DevReady runs inside Figma's plugin sandbox. Its main code makes no network requests. The panel's preview may load public Google Fonts, and you can turn that off (see [PRIVACY.md](PRIVACY.md)).

## Trust boundaries and how they are protected

| Boundary | Risk | Protection | Tested by |
|---|---|---|---|
| **Design content → generated code** | Layer names and text come from files that may not be trusted. They're written into HTML, JSX, Swift and Kotlin | Escaped for each target language: markup and attributes, `{}` in JSX, `$` templates in Kotlin, `\(` in Swift, control characters, bidi overrides ("Trojan Source") | `hostile-content` fixture × 6 languages (`npm test`) |
| **Generated HTML → live preview** | The preview renders generated HTML inside the panel | `<iframe sandbox="allow-same-origin">` with **no** `allow-scripts`, so scripts and event handlers never run. A CSP meta allows no requests except Google Fonts (none when offline), `referrerpolicy="no-referrer"`, no forms, no `<base>` | `npm run test:browser`: a hostile document with `<script>`, `onerror`, an external image and a form. Also checked: the test fails if the sandbox is removed |
| **Panel UI → main thread** | Messages from the UI iframe drive file edits and exports | Every message is checked against a per-type schema before it is handled. Unknown types are ignored and unknown fields dropped. Strings are length-capped, ids must look like Figma node ids, enums and numeric ranges are enforced (export format/scale, font upload size/type, http(s)-only dev resources) and settings keys are whitelisted. Invalid input shows an error toast | `message validation` (15 cases) in `npm test` |
| **File data → generated code** | Component mappings are stored in the Figma file (shared plugin data), which anyone with edit access, or another plugin, can write | Mappings are re-validated when read. The import path must be a plain module path, and it is emitted through a JS string-escaping helper | `component mappings from the file are validated and safely quoted` in `npm test` |

### Fixed in 1.1.0
- **Code injection via component mappings.** A crafted import path stored in the file (e.g. `./x';alert(1);//`) was concatenated into generated React code without escaping, so someone who opened the file and copied the code got the injected statement. Paths are now validated on save and on load, and quoted on output.

## Reporting a vulnerability

Please open a GitHub security advisory (**Security → Report a vulnerability**) rather than a public issue. Expect a reply within a week.
