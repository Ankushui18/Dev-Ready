# Security

DevReady runs inside Figma's plugin sandbox and only talks to Google Fonts (see [PRIVACY.md](PRIVACY.md)).

The main risk area is **generated code**. Layer names and text come from design files that may not be trusted, and they're written into HTML, JSX, Swift and Kotlin. All of these values are escaped for the target language. The `hostile-content` test fixture checks this on every commit: markup and attribute injection, `{}` in JSX, `$` templates in Kotlin, `\(` in Swift, control characters and bidi overrides.

To report a vulnerability, please open a GitHub security advisory (**Security → Report a vulnerability**) rather than a public issue. Expect a reply within a week.
