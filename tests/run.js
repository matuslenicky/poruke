#!/usr/bin/env node
/*
 * Automatické testy Poruke. Otvorí web v headless Chromiu (Playwright) na troch šírkach
 * (390, 820, 1440 px) a preklikne hlavné funkcie. Projekt nemení, len ho číta.
 *
 *   node tests/run.js                  koreňový index.html cez file://
 *   node tests/run.js poruke.html      iný súbor z koreňa projektu (offline verzia)
 *   SHARED=https://matuslenicky.github.io/poruke/ node tests/run.js   živá adresa
 *
 * Výstup: report.json a snímky obrazovky pri chybe v %TEMP%\poruke-tests\<čas>\.
 * Návratový kód: 0 = všetko prešlo, 1 = niektorý test zlyhal, 2 = test sa nedal spustiť.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

function loadPlaywright() {
  try { return require('playwright'); } catch { /* nie je lokálne, skúsime globálnu inštaláciu */ }
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(globalRoot, 'playwright'));
}

function resolveTarget() {
  if (process.env.SHARED) return process.env.SHARED;
  const arg = process.argv[2];
  if (arg && /^https?:\/\//.test(arg)) return arg;
  const file = path.resolve(ROOT, arg || 'index.html');
  if (!fs.existsSync(file)) throw new Error(`Súbor neexistuje: ${file}`);
  return pathToFileURL(file).href;
}

const VIEWPORTS = [
  { name: 'mobil-390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'tablet-820', width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

/* ---------- malý bežec testov ---------- */

const results = [];

async function test(ctx, name, fn) {
  const r = { viewport: ctx.vp.name, name, ok: true, errors: [], info: '', ms: 0 };
  const t0 = Date.now();
  try {
    await fn(r);
  } catch (e) {
    r.errors.push('výnimka: ' + String((e && e.message) || e).split('\n')[0]);
  }
  r.ok = r.errors.length === 0;
  r.ms = Date.now() - t0;
  if (!r.ok) {
    const shot = path.join(ctx.out, `${ctx.vp.name}-${slug(name)}.png`);
    try { await ctx.page.screenshot({ path: shot }); r.screenshot = shot; } catch { /* stránka mohla spadnúť */ }
  }
  results.push(r);
  const mark = r.ok ? '✓' : '✗';
  const info = r.info ? ` (${r.info})` : '';
  console.log(`${mark} [${r.viewport}] ${name}${info}${r.ok ? '' : '\n    - ' + r.errors.slice(0, 8).join('\n    - ')}`);
}

function check(r, cond, msg) {
  if (!cond) r.errors.push(msg);
  return !!cond;
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ---------- pomocníci pre stránku ---------- */

const isOpen = page => page.$eval('#req', d => d.open);
const activeId = page => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const shown = (page, sel) => page.$eval(sel, e => !e.hidden && getComputedStyle(e).display !== 'none');

async function closeDialog(page) {
  if (!(await isOpen(page))) return;
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('req').open, null, { timeout: 2000 });
}

async function fresh(page) {
  await page.reload({ waitUntil: 'load' });
}

async function dialogState(page) {
  return page.evaluate(() => {
    const $ = s => document.querySelector(s);
    return {
      open: $('#req').open,
      label: $('#steplabel').textContent.trim(),
      title: $('#req-title').textContent.trim(),
      cat: $('#f-cat').value,
      psc: $('#f-psc').value,
      desc: $('#f-desc').value,
      name: $('#f-name').value,
      backHidden: $('#back').hidden,
      next: $('#next').textContent.trim(),
      note: !$('#pro-note').hidden,
      noteText: $('#pro-note').textContent.trim(),
    };
  });
}

/* ---------- testy ---------- */

async function runViewport(browser, target, vp, out) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    deviceScaleFactor: vp.deviceScaleFactor,
    locale: 'sk-SK',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('konzola: ' + m.text()); });
  page.on('pageerror', e => problems.push('JS chyba: ' + e.message));
  page.on('requestfailed', q => problems.push(`nenačítané: ${q.url().slice(0, 120)} (${q.failure() && q.failure().errorText})`));
  page.on('response', resp => { if (resp.status() >= 400) problems.push(`HTTP ${resp.status()}: ${resp.url().slice(0, 120)}`); });

  const ctx = { vp, page, out };
  await page.goto(target, { waitUntil: 'load' });

  await test(ctx, 'bez vodorovného pretečenia', async r => {
    const o = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const off = [];
      if (sw > vw + 1) {
        const clipped = el => {
          for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            if (getComputedStyle(a).overflowX !== 'visible') return true;
          }
          return false;
        };
        for (const el of document.body.querySelectorAll('*')) {
          const b = el.getBoundingClientRect();
          if (b.width && b.right > vw + 1 && !clipped(el)) {
            const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            off.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} (pravý okraj ${Math.round(b.right)} px)`);
          }
        }
      }
      return { vw, sw, off: off.slice(0, 6) };
    });
    r.info = `šírka obsahu ${o.sw} / ${o.vw} px`;
    check(r, o.sw <= o.vw + 1, `stránka je širšia ako okno: ${o.off.join(', ') || 'príčina nenájdená'}`);
  });

  await test(ctx, 'vyhľadávanie → dialóg', async r => {
    await fresh(page);
    check(r, (await page.$$eval('#tasks option', o => o.length)) > 0, 'našepkávač #tasks je prázdny');

    // Známa práca + miesto, odoslanie klávesom Enter v poli „Kde“
    await page.fill('#q', 'Výmena bojlera');
    await page.fill('#where', '917 01');
    await page.press('#where', 'Enter');
    let s = await dialogState(page);
    check(r, s.open, 'Enter v poli „Kde“ neotvoril dialóg');
    check(r, s.cat === 'voda', `„Výmena bojlera“ → kategória ${s.cat}, čakal som voda`);
    check(r, s.psc === '917 01', `PSČ sa neprenieslo (${s.psc})`);
    check(r, s.desc === 'Výmena bojlera', `opis sa neprenesol (${s.desc})`);
    check(r, s.label === 'Krok 1 z 3', `krok: ${s.label}`);
    check(r, (await activeId(page)) === 'f-cat', 'pri vyplnenom mieste má byť fokus na druhu práce');
    await closeDialog(page);

    // Enter v poli „Čo“ bez miesta presunie fokus do „Kde“ a dialóg neotvorí
    await fresh(page);
    await page.fill('#q', 'kosenie');
    await page.press('#q', 'Enter');
    check(r, !(await isOpen(page)), 'Enter v poli „Čo“ bez miesta nemá otvoriť dialóg');
    check(r, (await activeId(page)) === 'where', 'Enter v poli „Čo“ má presunúť fokus do „Kde“');
    await page.fill('#where', 'Trnava');
    await page.click('#search [type="submit"]');
    s = await dialogState(page);
    check(r, s.open && s.cat === 'zahrada', `„kosenie“ → ${s.cat}, čakal som zahrada`);
    await closeDialog(page);

    // Neznámy text → Iné; prázdne hľadanie → fokus na PSČ
    await fresh(page);
    await page.fill('#q', 'qwerty');
    await page.click('#search [type="submit"]');
    s = await dialogState(page);
    check(r, s.open && s.cat === 'ine', `neznámy text → ${s.cat}, čakal som ine`);
    await closeDialog(page);
    await fresh(page);
    await page.click('#search [type="submit"]');
    check(r, await isOpen(page), 'prázdne hľadanie neotvorilo dialóg');
    check(r, (await activeId(page)) === 'f-psc', 'bez miesta má byť fokus na PSČ');
    await closeDialog(page);
  });

  await test(ctx, 'všetky [data-open] otvoria dialóg', async r => {
    await fresh(page);
    const all = page.locator('[data-open]');
    const n = await all.count();
    let tested = 0;
    for (let i = 0; i < n; i++) {
      const el = all.nth(i);
      if (!(await el.isVisible())) continue;
      const info = await el.evaluate(e => ({
        cat: e.dataset.open,
        desc: e.dataset.desc || '',
        pro: e.dataset.pro || '',
        what: `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/)[0]} „${(e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim().slice(0, 40)}“`,
      }));
      try {
        await el.click({ timeout: 4000 });
      } catch (e) {
        const box = await el.evaluate(x => {
          const b = x.getBoundingClientRect();
          return `${Math.round(b.left)}..${Math.round(b.right)} px pri šírke okna ${innerWidth}`;
        }).catch(() => '?');
        const off = /^-?\d+\.\.-?\d+/.test(box) && (parseInt(box, 10) < 0 || parseInt(box.split('..')[1], 10) > vp.width);
        r.errors.push(`${info.what}: nedá sa naň kliknúť${off ? ', je mimo obrazovky' : ''} (${box})`);
        continue;
      }
      tested++;
      const s = await dialogState(page);
      if (!check(r, s.open, `${info.what}: dialóg sa neotvoril`)) continue;
      if (info.cat) check(r, s.cat === info.cat, `${info.what}: druh práce ${s.cat}, čakal som ${info.cat}`);
      if (info.desc) check(r, s.desc === info.desc, `${info.what}: opis „${s.desc}“, čakal som „${info.desc}“`);
      check(r, s.note === !!info.pro, `${info.what}: poznámka o majstrovi ${s.note ? 'je' : 'nie je'} zobrazená`);
      if (info.pro) check(r, s.noteText.includes(info.pro), `${info.what}: poznámka neobsahuje meno ${info.pro}`);
      check(r, s.label === 'Krok 1 z 3', `${info.what}: otvoril sa na „${s.label}“`);
      await closeDialog(page);
    }
    r.info = `${tested} viditeľných z ${n}`;
    check(r, tested > 0, 'na stránke nie je žiadne viditeľné [data-open]');
  });

  await test(ctx, 'dialóg: 3 kroky, validácia, súhrn', async r => {
    await fresh(page);
    await page.locator('[data-open=""]').filter({ visible: true }).first().click();
    let s = await dialogState(page);
    check(r, s.open && s.label === 'Krok 1 z 3' && s.title === 'Nová zákazka', `začiatok: ${s.label} / ${s.title}`);
    check(r, s.backHidden && s.next === 'Pokračovať', 'v kroku 1 nemá byť „Späť“ a hlavné tlačidlo má byť „Pokračovať“');
    check(r, s.cat === '', `bez predvoľby má byť druh práce prázdny, je „${s.cat}“`);

    // Krok 1: druh práce je povinný a kontroluje sa pred miestom
    await page.fill('#f-psc', '');
    await page.click('#next');
    check(r, await shown(page, '#e-cat'), 'prázdny druh práce: chyba sa nezobrazila');
    check(r, (await page.getAttribute('#f-cat', 'aria-invalid')) === 'true', 'prázdny druh práce: chýba aria-invalid');
    check(r, (await activeId(page)) === 'f-cat', 'prázdny druh práce: fokus nie je na výbere');
    check(r, !(await shown(page, '#e-psc')), 'chyba PSČ sa má ukázať až po vybraní druhu práce');
    await page.selectOption('#f-cat', 'elektro');
    check(r, !(await shown(page, '#e-cat')), 'výber druhu práce neskryl chybu');

    // Krok 1: miesto
    await page.click('#next');
    check(r, await shown(page, '#e-psc'), 'prázdne PSČ: chyba sa nezobrazila');
    check(r, (await page.getAttribute('#f-psc', 'aria-invalid')) === 'true', 'prázdne PSČ: chýba aria-invalid');
    check(r, (await activeId(page)) === 'f-psc', 'prázdne PSČ: fokus nie je na poli');
    await page.type('#f-psc', '1');
    check(r, !(await shown(page, '#e-psc')), 'písanie do PSČ neskrylo chybu');
    await page.fill('#f-psc', '12');
    await page.click('#next');
    check(r, (await txt(page, '#steplabel')) === 'Krok 1 z 3', 'PSČ „12“ nemalo prejsť');
    await page.fill('#f-psc', 'Trnava');
    await page.click('#next');
    s = await dialogState(page);
    check(r, s.label === 'Krok 2 z 3' && s.title === 'Podrobnosti', `po kroku 1: ${s.label} / ${s.title}`);
    check(r, !s.backHidden, 'v kroku 2 chýba „Späť“');

    // Späť a znova dopredu
    await page.click('#back');
    s = await dialogState(page);
    check(r, s.label === 'Krok 1 z 3' && s.psc === 'Trnava', '„Späť“ nevrátil na krok 1 so zachovaným miestom');
    await page.click('#next');

    // Krok 2: opis (aj kontrola, že súhrn nevloží HTML zo vstupu)
    await page.fill('#f-desc', 'krátko');
    await page.click('#next');
    check(r, await shown(page, '#e-desc'), 'krátky opis: chyba sa nezobrazila');
    const desc = 'Výmena bojlera <b>80 l</b> v kúpeľni';
    await page.fill('#f-desc', desc);
    await page.click('#next');
    s = await dialogState(page);
    check(r, s.label === 'Krok 3 z 3' && s.title === 'Kam poslať ponuky', `po kroku 2: ${s.label} / ${s.title}`);
    check(r, s.next === 'Odoslať žiadosť', `tlačidlo v kroku 3: ${s.next}`);

    // Krok 3: kontakt
    await page.click('#next');
    for (const id of ['e-name', 'e-email', 'e-consent']) check(r, await shown(page, '#' + id), `prázdny kontakt: chýba chyba #${id}`);
    check(r, (await activeId(page)) === 'f-name', 'prázdny kontakt: fokus má byť na mene');
    await page.fill('#f-name', 'Ján Testovací');
    await page.fill('#f-email', 'jan@');
    await page.check('#f-consent');
    await page.click('#next');
    check(r, await shown(page, '#e-email'), 'e-mail „jan@“ nemal prejsť');
    check(r, !(await shown(page, '#e-name')), 'chyba mena ostala aj po vyplnení');
    check(r, (await activeId(page)) === 'f-email', 'zlý e-mail: fokus má byť na e-maile');
    await page.fill('#f-email', 'jan@example.sk');

    // Faktúra na firmu: pole IČO sa ukáže len so zaškrtnutím a musí mať 8 číslic
    check(r, !(await shown(page, '#firm-box')), 'pole IČO má byť skryté, kým nie je zaškrtnutá faktúra');
    await page.check('#f-firm');
    check(r, await shown(page, '#firm-box'), 'zaškrtnutie faktúry neodkrylo pole IČO');
    check(r, (await activeId(page)) === 'f-ico', 'po zaškrtnutí faktúry má byť fokus na IČO');
    await page.uncheck('#f-firm');
    check(r, !(await shown(page, '#firm-box')), 'odškrtnutie faktúry neskrylo pole IČO');
    await page.check('#f-firm');
    await page.fill('#f-ico', '123');
    await page.selectOption('#f-lang', { label: 'Čeština' });
    await page.click('#next');
    check(r, (await txt(page, '#steplabel')) === 'Krok 3 z 3', 'IČO „123“ nemalo prejsť');
    check(r, await shown(page, '#e-ico'), 'zlé IČO: chyba sa nezobrazila');
    check(r, !(await shown(page, '#e-email')), 'chyba e-mailu ostala aj po oprave');
    check(r, (await activeId(page)) === 'f-ico', 'zlé IČO: fokus má byť na IČO');
    await page.fill('#f-ico', '12 345 678');
    await page.click('#next');

    // Krok 4: súhrn
    s = await dialogState(page);
    check(r, s.label === 'Hotovo' && s.title === 'Zhrnutie žiadosti', `po odoslaní: ${s.label} / ${s.title}`);
    check(r, s.backHidden && s.next === 'Zavrieť', 'v súhrne nemá byť „Späť“ a tlačidlo má byť „Zavrieť“');
    const sum = await page.evaluate(() => {
      const dl = document.getElementById('summary');
      const map = {};
      dl.querySelectorAll('dt').forEach(dt => { map[dt.textContent.trim()] = dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : ''; });
      return { map, injected: !!dl.querySelector('b'), done: document.getElementById('done-text').textContent };
    });
    for (const k of ['Práca', 'Miesto', 'Termín', 'Opis', 'Fotky', 'Rozpočet', 'Jazyk', 'Faktúra na IČO']) check(r, k in sum.map, `v súhrne chýba „${k}“`);
    check(r, sum.map['Práca'] === 'Elektrikár', `súhrn Práca: ${sum.map['Práca']}`);
    check(r, sum.map['Miesto'] === 'Trnava', `súhrn Miesto: ${sum.map['Miesto']}`);
    check(r, sum.map['Jazyk'] === 'Čeština', `súhrn Jazyk: ${sum.map['Jazyk']}`);
    check(r, sum.map['Faktúra na IČO'] === '12345678', `súhrn Faktúra na IČO: ${sum.map['Faktúra na IČO']}`);
    check(r, sum.map['Opis'] === desc, `súhrn Opis: ${sum.map['Opis']}`);
    check(r, !sum.injected, 'súhrn vložil HTML z opisu (chýba escapovanie)');
    check(r, sum.done.includes('jan@example.sk'), 'text po odoslaní neobsahuje e-mail');

    await page.click('#next');
    check(r, !(await isOpen(page)), '„Zavrieť“ v súhrne nezavrel dialóg');

    // Nové otvorenie po odoslaní začne od začiatku s prázdnym formulárom
    await page.locator('[data-open=""]').filter({ visible: true }).first().click();
    s = await dialogState(page);
    check(r, s.label === 'Krok 1 z 3' && s.name === '' && s.desc === '' && s.cat === '', 'po odoslaní sa formulár pri ďalšom otvorení nevyprázdnil');
    check(r, !(await page.isChecked('#f-firm')) && !(await shown(page, '#firm-box')), 'po odoslaní ostala zaškrtnutá faktúra alebo viditeľné pole IČO');
    await closeDialog(page);
  });

  await test(ctx, 'druhy práce: formulár, adresár a vyhľadávanie', async r => {
    await fresh(page);
    const d = await page.evaluate(() => ({
      options: [...document.querySelectorAll('#f-cat option')].map(o => o.value).filter(Boolean),
      opens: [...new Set([...document.querySelectorAll('[data-open]')].map(e => e.dataset.open).filter(Boolean))],
      dir: [...document.querySelectorAll('.dir-item[data-open]')].map(e => e.dataset.open),
    }));
    const missing = d.opens.filter(c => !d.options.includes(c));
    check(r, missing.length === 0, `tlačidlá otvárajú druh práce, ktorý vo formulári nie je: ${missing.join(', ')}`);
    const noDir = d.options.filter(c => c !== 'ine' && !d.dir.includes(c));
    check(r, noDir.length === 0, `druh práce bez položky v adresári služieb: ${noDir.join(', ')}`);
    for (const c of ['murar', 'podlahy', 'strecha', 'stolar']) check(r, d.options.includes(c) && d.dir.includes(c), `chýba nový druh práce ${c}`);
    // Vyhľadávanie rozpozná aj nové druhy práce
    const cases = [['Oprava strechy', 'strecha'], ['Pokládka laminátu', 'podlahy'], ['Sadrokartónová priečka', 'murar'], ['Stolár', 'stolar']];
    for (const [q, want] of cases) {
      await fresh(page);
      await page.fill('#q', q);
      await page.click('#search [type="submit"]');
      const s = await dialogState(page);
      check(r, s.open && s.cat === want, `„${q}“ → ${s.cat || 'nič'}, čakal som ${want}`);
      await closeDialog(page);
    }
    r.info = `${d.options.length} druhov, ${d.dir.length} v adresári`;
  });

  await test(ctx, 'miesto: obec alebo PSČ nastaví kraj', async r => {
    await fresh(page);
    const obce = await page.$$eval('#obce option', o => o.length).catch(() => 0);
    check(r, obce > 50, `našepkávač obcí #obce má len ${obce} položiek`);
    const counts = await page.$$eval('#pros .pro', ps => ps.reduce((m, p) => (m[p.dataset.kraj] = (m[p.dataset.kraj] || 0) + 1, m), {}));
    const found = [];
    for (const [where, k, name] of [['Trnava', 'TT', 'Trnavský kraj'], ['040 01', 'KE', 'Košický kraj']]) {
      await page.fill('#where', where);
      const ok = await page.waitForFunction(n => document.getElementById('where-hint').textContent.includes(n), name, { timeout: 2000 }).then(() => true, () => false);
      if (!check(r, ok, `„${where}“: nápoveda pod poľom nespomína ${name}`)) continue;
      const st = await page.evaluate(() => {
        const sel = document.getElementById('kraj');
        return {
          k: sel.options[sel.selectedIndex].dataset.k || '',
          cap: document.getElementById('pcap').textContent.trim(),
          pressed: [...document.querySelectorAll('#filter button[aria-pressed="true"]')].map(b => b.dataset.kraj),
          visible: [...document.querySelectorAll('#pros .pro')].filter(p => !p.hidden && getComputedStyle(p).display !== 'none').map(p => p.dataset.kraj),
        };
      });
      const want = counts[k] || 0;
      check(r, st.k === k, `„${where}“: ceny sú pre ${st.k || 'celé Slovensko'}, čakal som ${k}`);
      check(r, st.cap.startsWith(name), `„${where}“: popis cien „${st.cap}“`);
      check(r, st.pressed.length === 1 && st.pressed[0] === k, `„${where}“: filter majstrov je ${st.pressed.join(',') || 'žiadny'}, čakal som ${k}`);
      check(r, st.visible.length === want && st.visible.every(p => p === k), `„${where}“: zobrazených majstrov ${st.visible.length}, čakal som ${want}`);
      const n = st.visible.length;
      found.push(`${where} → ${k} (${n} ${n === 1 ? 'majster' : n > 1 && n < 5 ? 'majstri' : 'majstrov'})`);
    }
    await page.fill('#where', 'Xyzabc');
    const cleared = await page.waitForFunction(() => document.getElementById('where-hint').textContent.trim() === '', null, { timeout: 2000 }).then(() => true, () => false);
    check(r, cleared, 'neznáma obec: nápoveda ostala zobrazená');
    r.info = found.join(', ');
  });

  await test(ctx, 'dialóg: zatvorenie (×, Esc, pozadie)', async r => {
    await fresh(page);
    const opener = page.locator('[data-open=""]').filter({ visible: true }).first();
    await opener.click();
    await page.click('#req-close');
    check(r, !(await isOpen(page)), 'krížik nezavrel dialóg');
    await opener.click();
    await page.keyboard.press('Escape');
    check(r, !(await isOpen(page)), 'Esc nezavrel dialóg');
    await opener.click();
    const outside = await page.evaluate(() => {
      const b = document.querySelector('#req-form').getBoundingClientRect();
      const W = innerWidth, H = innerHeight;
      const pts = [[W / 2, 8], [8, H / 2], [W - 8, H / 2], [W / 2, H - 8]];
      const p = pts.find(([x, y]) => x < b.left || x > b.right || y < b.top || y > b.bottom);
      return p || null;
    });
    if (outside) {
      await page.mouse.click(outside[0], outside[1]);
      check(r, !(await isOpen(page)), 'klik na pozadie nezavrel dialóg');
      r.info = 'pozadie overené';
    } else {
      r.info = 'dialóg zaberá celé okno, klik na pozadie sa nedá overiť';
    }
    await closeDialog(page);
  });

  await test(ctx, 'filter krajov (TN = prázdny stav)', async r => {
    await fresh(page);
    const chips = await page.$$eval('#filter button[data-kraj]', bs => bs.map(b => b.dataset.kraj));
    const pros = await page.$$eval('#pros .pro', ps => ps.map(p => p.dataset.kraj));
    check(r, chips.includes('') && chips.includes('TN'), `filter nemá „Všetky“ alebo TN (${chips.join(',')})`);
    check(r, pros.length > 0, 'žiadni majstri v #pros');
    for (const k of [...chips.filter(Boolean), '']) {
      await page.click(`#filter button[data-kraj="${k}"]`);
      const st = await page.evaluate(() => ({
        visible: [...document.querySelectorAll('#pros .pro')].filter(p => !p.hidden && getComputedStyle(p).display !== 'none').map(p => p.dataset.kraj),
        empty: !document.getElementById('pros-empty').hidden,
        pressed: [...document.querySelectorAll('#filter button[data-kraj]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.kraj),
      }));
      const want = k ? pros.filter(p => p === k).length : pros.length;
      const label = k || 'Všetky';
      check(r, st.visible.length === want && st.visible.every(p => !k || p === k), `${label}: zobrazených ${st.visible.length}, čakal som ${want}`);
      check(r, st.empty === (want === 0), `${label}: prázdny stav ${st.empty ? 'je' : 'nie je'} zobrazený`);
      check(r, st.pressed.length === 1 && st.pressed[0] === k, `${label}: aria-pressed má ${st.pressed.join(',') || 'nikto'}`);
    }
    // TN: prázdny stav a jeho tlačidlo
    await page.click('#filter button[data-kraj="TN"]');
    check(r, await shown(page, '#pros-empty'), 'TN: prázdny stav sa nezobrazil');
    const emptyBtn = page.locator('#pros-empty [data-open]');
    if (await emptyBtn.count()) {
      await emptyBtn.first().click();
      check(r, await isOpen(page), 'TN: tlačidlo v prázdnom stave neotvorilo dialóg');
      await closeDialog(page);
    }
    await page.click('#filter button[data-kraj=""]');
    r.info = `${chips.length} filtrov, ${pros.length} majstrov`;
  });

  await test(ctx, 'ceny: kraj a s/bez DPH', async r => {
    await fresh(page);
    const opts = await page.$$eval('#kraj option', os => os.map(o => ({ v: o.value, t: o.textContent.trim() })));
    check(r, opts.length > 1, 'výber kraja má málo možností');
    let checked = 0;
    for (const vat of ['ex', 'in']) {
      await page.click(`label[for="vat-${vat}"]`);
      for (const o of opts) {
        await page.selectOption('#kraj', o.v);
        const res = await page.evaluate(({ v, vat }) => {
          const k = parseFloat(v) || 1;
          const f = x => Math.round((x * k) / (vat === 'in' ? 1 : 1.23));
          const fmt = n => n.toLocaleString('sk-SK', { maximumFractionDigits: 0 });
          const rows = [...document.querySelectorAll('#ptable tbody tr')].map(tr => ({
            what: tr.querySelector('th') ? tr.querySelector('th').firstChild.textContent.trim() : '?',
            got: tr.querySelector('td').textContent.trim(),
            want: `${fmt(f(+tr.dataset.min))} – ${fmt(f(+tr.dataset.max))} €`,
          }));
          return { rows, cap: document.getElementById('pcap').textContent.trim() };
        }, { v: o.v, vat });
        const wantCap = `${o.t} · ceny ${vat === 'in' ? 's DPH 23 %' : 'bez DPH'}`;
        check(r, res.cap === wantCap, `popis tabuľky „${res.cap}“, čakal som „${wantCap}“`);
        check(r, res.rows.length > 0, 'tabuľka cien je prázdna');
        // Stránka dáva pred € nezalomiteľnú medzeru, preto sa medzery porovnávajú bez ohľadu na druh.
        const sp = s => s.replace(/\s+/g, ' ');
        for (const row of res.rows) {
          checked++;
          check(r, sp(row.got) === sp(row.want),`${o.t}, ${vat === 'in' ? 's DPH' : 'bez DPH'}, ${row.what}: „${row.got}“, čakal som „${row.want}“`);
        }
      }
    }
    r.info = `${checked} cien overených`;
  });

  await test(ctx, 'IČO', async r => {
    await fresh(page);
    const submit = async v => {
      await page.fill('#ico', v);
      await page.click('#ico-form [type="submit"]');
      return page.evaluate(() => {
        const m = document.getElementById('ico-msg');
        return { cls: m.className, text: m.textContent.trim(), invalid: document.getElementById('ico').getAttribute('aria-invalid') };
      });
    };
    let s = await submit('123');
    check(r, /\bbad\b/.test(s.cls) && s.invalid === 'true' && s.text.includes('8 číslic'), `„123“: ${s.cls} / ${s.invalid} / ${s.text}`);
    s = await submit('12 345 678');
    check(r, /\bok\b/.test(s.cls) && s.invalid === null && s.text.includes('IČO 12 345 678'), `„12 345 678“: ${s.cls} / ${s.invalid} / ${s.text}`);
    s = await submit('1234567a');
    check(r, /\bbad\b/.test(s.cls), `„1234567a“ nemalo prejsť (${s.cls})`);
    await page.fill('#ico', '87654321');
    await page.press('#ico', 'Enter');
    s = await page.evaluate(() => document.getElementById('ico-msg').className);
    check(r, /\bok\b/.test(s), 'Enter v poli IČO neodoslal overenie');
  });

  await test(ctx, 'odkazy na otázky (FAQ)', async r => {
    await fresh(page);
    const hrefs = [...new Set(await page.$$eval('a[href^="#faq-"]', as => as.map(a => a.getAttribute('href'))))];
    check(r, hrefs.length > 0, 'na stránke nie sú odkazy na otázky');
    const inView = id => page.waitForFunction(i => {
      const d = document.getElementById(i);
      if (!d || !d.open) return false;
      const t = d.getBoundingClientRect().top;
      return t > -4 && t < innerHeight * 0.6;
    }, id, { timeout: 3000 }).then(() => true, () => false);
    for (const h of hrefs) {
      const id = h.slice(1);
      const isDetails = await page.evaluate(i => { const d = document.getElementById(i); return !!d && d.tagName === 'DETAILS'; }, id);
      if (!check(r, isDetails, `${h}: cieľ neexistuje alebo nie je <details>`)) continue;
      const link = page.locator(`a[href="${h}"]`).filter({ visible: true }).first();
      if (!(await link.count())) { r.errors.push(`${h}: odkaz nie je viditeľný`); continue; }
      await page.evaluate(i => { document.getElementById(i).open = false; }, id);
      await link.click();
      check(r, await inView(id), `${h}: otázka sa neotvorila alebo nie je na obrazovke`);
      // Druhý klik na ten istý odkaz (hash sa nezmení) má otázku znova otvoriť
      await page.evaluate(i => { document.getElementById(i).open = false; }, id);
      await link.click();
      check(r, await inView(id), `${h}: opakovaný klik otázku znova neotvoril`);
    }
    // Priamy odkaz na otázku pri načítaní stránky
    const first = await page.$eval('details[id^="faq-"]', d => d.id).catch(() => '');
    if (first) {
      await page.goto(target.split('#')[0] + '#' + first, { waitUntil: 'load' });
      check(r, await inView(first), `adresa s #${first} neotvorila otázku`);
      await page.goto(target, { waitUntil: 'load' });
    }
    r.info = `${hrefs.length} odkazov`;
  });

  await test(ctx, 'kotvy vedú na existujúce miesta', async r => {
    await fresh(page);
    const bad = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1)))));
    check(r, bad.length === 0, `mŕtve kotvy: ${[...new Set(bad)].join(', ')}`);
  });

  await test(ctx, 'bez chýb v konzole a sieti', async r => {
    const uniq = [...new Set(problems)];
    r.info = uniq.length ? `${uniq.length} problémov` : 'čisto';
    uniq.slice(0, 10).forEach(p => r.errors.push(p));
  });

  await context.close();
}

async function main() {
  let target, pw;
  try {
    target = resolveTarget();
    pw = loadPlaywright();
  } catch (e) {
    console.error('Test sa nedá spustiť: ' + e.message);
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(os.tmpdir(), 'poruke-tests', stamp);
  fs.mkdirSync(out, { recursive: true });
  console.log(`Poruke testy: ${target}\nVýstupy: ${out}\n`);

  const browser = await pw.chromium.launch({ headless: true });
  const t0 = Date.now();
  try {
    for (const vp of VIEWPORTS) await runViewport(browser, target, vp, out);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.ok);
  const report = { target, date: new Date().toISOString(), ms: Date.now() - t0, passed: results.length - failed.length, failed: failed.length, results };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${failed.length ? '✗' : '✓'} ${report.passed}/${results.length} testov prešlo za ${(report.ms / 1000).toFixed(1)} s`);
  console.log(`Report: ${path.join(out, 'report.json')}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => {
  console.error('Test spadol: ' + ((e && e.stack) || e));
  process.exit(2);
});
