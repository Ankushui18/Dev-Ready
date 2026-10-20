## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The user-visible problem, or the bug. -->

## Checklist

- [ ] `npm run verify` passes (layout + Figma sandbox check + ESLint + 144 checks)
- [ ] For a code-generation fix: a fixture in `tests/fixtures.js` reproduces the bug
- [ ] Deliberate output change? `npm test -- --update-golden` and review the diff
- [ ] If the number of checks changed: `npm test -- --report` and update the README badge
- [ ] For a new output path: an escaping case in the `hostile-content` fixture
- [ ] For a new UI → plugin message: a schema entry in `MSG_SCHEMA` **and** a case in `messageValidation()`
- [ ] For a UI change: `ui.html` still renders in a browser on demo data (light and dark)
- [ ] No build step, no new runtime dependency in `devready-plugin/`
- [ ] `CHANGELOG.md` updated under **Unreleased**
