// Vytvorí supabase/seed.sql s majstrami, fotkami z realizácií a hodnoteniami presne tak, ako ich dnes ukazuje stránka.
// Majstri a fotky sa čítajú zo zdroja (PROS, PF_PHOTOS v src/index.html), hodnotenia z vykreslených profilov v Playwright.
// Použitie: node supabase/gen-seed.js   (vyžaduje zostavený index.html a globálny playwright)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');

const literal = (start, end) => {
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`V zdroji chýba ${start}`);
  const b = src.indexOf(end, a);
  return src.slice(a + start.length, b + end.length - (end.length - 1));
};
// PROS: pole polí [meno, firma?, remeslo, obec, kraj, hodnotenie, počet, dokončené, cena, odpoveď h, jazyky, štítok]
const prosSrc = literal('const PROS = [', '].map(');
const PROS = Function(`return [${prosSrc.slice(0, -1)}]`)();
const PF_PHOTOS = Function(`return ${literal('const PF_PHOTOS = ', '};')}`)();

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const q = v => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?nodb';
  await page.goto(url, { waitUntil: 'load' });
  const reviews = {};
  for (const [name] of PROS) {
    await page.evaluate(h => { location.hash = h; }, `#profil-${slug(name)}`);
    await page.waitForFunction(n => document.querySelector('#pf[open] #pf-name')?.textContent.trim().startsWith(n), name, { timeout: 5000 })
      .catch(async e => {
        const st = await page.evaluate(() => ({ hash: location.hash, open: document.getElementById('pf').open, name: document.querySelector('#pf-name')?.textContent }));
        throw new Error(`Profil „${name}“ sa neotvoril: ${JSON.stringify(st)} (${e.message.split('\n')[0]})`);
      });
    reviews[name] = await page.$$eval('#pf .pf-revs li', lis => lis.map(li => {
      const small = li.querySelector('small').textContent.split(' · ');
      return {
        text: li.querySelector('blockquote').textContent,
        autor: small[0], praca: small[1], mesiac: small.slice(2).join(' · '),
        hviezdy: +(li.querySelector('.sr').textContent.match(/\d/) || [5])[0]
      };
    }));
    await page.evaluate(() => document.getElementById('pf').close());
    await page.waitForFunction(() => !location.hash); // udalosť close zmaže hash až neskôr
  }
  await browser.close();

  const out = ['-- Poruke: počiatočné dáta (vygenerované z gen-seed.js, ilustračné údaje)', 'begin;',
    'delete from public.hodnotenia; delete from public.fotky_realizacii; delete from public.majstri;'];
  out.push('insert into public.majstri (id, meno, firma, remeslo, obec, kraj, hodnotenie, pocet_hodnoteni, dokoncene, cena, odpoved_h, jazyky, stitok) values');
  out.push(PROS.map(([meno, firma, remeslo, obec, kraj, hod, pocet, dok, cena, odp, jaz, stitok], i) =>
    `  (${[i, q(meno), !!firma, q(remeslo), q(obec), q(kraj), hod.toFixed(1), pocet, dok, q(cena), odp, q(jaz), q(stitok)].join(', ')})`).join(',\n') + ';');
  const fotky = [];
  PROS.forEach(([meno], i) => (PF_PHOTOS[meno] || []).forEach(([cls, popis], k) => fotky.push(`  (${i}, ${k + 1}, ${q(cls.replace(/^ph-/, ''))}, ${q(popis)})`)));
  if (fotky.length) out.push('insert into public.fotky_realizacii (majster_id, poradie, obrazok, popis) values', fotky.join(',\n') + ';');
  const revs = [];
  PROS.forEach(([meno], i) => reviews[meno].forEach((r, k) => revs.push(`  (${i}, ${k + 1}, ${q(r.text)}, ${q(r.autor)}, ${q(r.praca)}, ${q(r.mesiac)}, ${r.hviezdy})`)));
  out.push('insert into public.hodnotenia (majster_id, poradie, text, autor, praca, mesiac, hviezdy) values', revs.join(',\n') + ';');
  out.push('commit;', '');
  fs.writeFileSync(path.join(__dirname, 'seed.sql'), out.join('\n'));
  console.log(`seed.sql: ${PROS.length} majstrov, ${fotky.length} fotiek, ${revs.length} hodnotení`);
})().catch(e => { console.error(e); process.exit(1); });
