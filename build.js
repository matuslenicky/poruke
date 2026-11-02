// Zostaví stránku zo src/index.html do dvoch výstupov:
//   index.html   pre web (GitHub Pages): fonty vložené, fotky ako súbory zo src/photos (rýchlejšie prvé vykreslenie)
//   poruke.html  na posielanie ako príloha: fonty aj fotky vložené ako data: URI, funguje offline
// Použitie: node build.js [--draft]   (--draft dovolí chýbajúce fotky, nahradí ich zástupnou plochou)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const MIME = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const draft = process.argv.includes('--draft');
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#c9d4e8"/></svg>');

const dataUri = rel => {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) throw new Error(`Chýba súbor: src/${rel}`);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Neznámy typ: ${rel}`);
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

// Fonty (oba výstupy): <link rel="stylesheet" href="fonts/fonts.css"> → <style id="fonts">…</style>
const fontLink = /<link rel="stylesheet" href="fonts\/fonts\.css">/;
if (!fontLink.test(html)) throw new Error('V src/index.html chýba odkaz na fonts/fonts.css');
const fontCss = fs.readFileSync(path.join(SRC, 'fonts', 'fonts.css'), 'utf8')
  .replace(/url\(([^)]+\.woff2?)\)/g, (_, f) => `url(${dataUri(path.join('fonts', f))})`);
html = html.replace(fontLink, () => `<style id="fonts">\n${fontCss}</style>`);

// Kredity fotiek s licenciou CC BY do pätičky (CC0 a public domain kredit nevyžadujú)
const creditsFile = path.join(SRC, 'photos', 'credits.json');
if (fs.existsSync(creditsFile)) {
  const LABEL = { kotol: 'bojler', malovanie: 'maľovanie', upratovanie: 'upratovanie', obklad: 'dlažba', stahovanie: 'balenie', zahrada: 'kosenie', elektro: 'rozvádzač', kuchyna: 'kuchyňa', 's-instalater': 'inštalatér', 's-upratovanie': 'upratovanie 2', 's-zahrada': 'záhradník' };
  const by = JSON.parse(fs.readFileSync(creditsFile, 'utf8')).filter(c => !/cc0|pdm|public/i.test(c.license || ''));
  const groups = {};
  for (const c of by) (groups[`${c.creator}|${c.license}|${c.license_url}`] ||= []).push(c);
  const parts = Object.entries(groups).map(([k, list]) => {
    const [creator, license, url] = k.split('|');
    const links = list.map(c => `<a href="${esc(c.source_url)}" rel="noopener">${esc(LABEL[c.key] || c.key)}</a>`).join(', ');
    return `${esc(creator)}, <a href="${esc(url)}" rel="noopener">${esc(license)}</a> (${links})`;
  });
  html = html.replace('<!--credits-->', parts.length ? ` Fotky: ${parts.join('; ')}, upravené (výrez, farby, retuš značiek); ostatné CC0 alebo voľné dielo (StockSnap, Wikimedia Commons).` : ' Fotky sú voľné diela (CC0).');
}

// Fotky: src="photos/x.jpg" a url(photos/x.jpg)
const photoRe = { attr: /src="(photos\/[^"]+)"/g, css: /url\((photos\/[^)]+)\)/g };
const check = f => {
  if (fs.existsSync(path.join(SRC, f))) return true;
  if (draft) { console.warn(`! chýba ${f}, použitá zástupná plocha`); return false; }
  throw new Error(`Chýba súbor: src/${f}`);
};
const withPhotos = mode => html
  .replace(photoRe.attr, (_, f) => `src="${check(f) ? (mode === 'web' ? 'src/' + f : dataUri(f)) : PLACEHOLDER}"`)
  .replace(photoRe.css, (_, f) => `url(${check(f) ? (mode === 'web' ? 'src/' + f : dataUri(f)) : PLACEHOLDER})`);

const web = withPhotos('web');
const offline = withPhotos('offline');
fs.writeFileSync(path.join(ROOT, 'index.html'), web);
fs.writeFileSync(path.join(ROOT, 'poruke.html'), offline);
const kb = s => Math.round(Buffer.byteLength(s) / 1024);
console.log(`index.html (web): ${kb(web)} KB · poruke.html (offline): ${kb(offline)} KB · fotky: ${(html.match(photoRe.css) || []).length + (html.match(photoRe.attr) || []).length}`);
