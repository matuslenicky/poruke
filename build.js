// Zostaví jednosúborový index.html zo src/index.html: vloží fonty (src/fonts) a fotky (src/photos) ako data: URI.
// Použitie: node build.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'index.html');
const MIME = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const dataUri = rel => {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) throw new Error(`Chýba súbor: src/${rel}`);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Neznámy typ: ${rel}`);
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

// Fonty: <link rel="stylesheet" href="fonts/fonts.css"> → <style id="fonts">…</style>
const fontLink = /<link rel="stylesheet" href="fonts\/fonts\.css">/;
if (!fontLink.test(html)) throw new Error('V src/index.html chýba odkaz na fonts/fonts.css');
const fontCss = fs.readFileSync(path.join(SRC, 'fonts', 'fonts.css'), 'utf8')
  .replace(/url\(([^)]+\.woff2?)\)/g, (_, f) => `url(${dataUri(path.join('fonts', f))})`);
html = html.replace(fontLink, () => `<style id="fonts">\n${fontCss}</style>`);

// Fotky: src="photos/x.jpg" a url(photos/x.jpg). Chýbajúca fotka = chyba, s --draft len zástupná plocha.
const draft = process.argv.includes('--draft');
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#c9d4e8"/></svg>');
let photos = 0;
const photo = f => {
  photos++;
  if (draft && !fs.existsSync(path.join(SRC, f))) { console.warn(`! chýba ${f}, použitá zástupná plocha`); return PLACEHOLDER; }
  return dataUri(f);
};
html = html
  .replace(/src="(photos\/[^"]+)"/g, (_, f) => `src="${photo(f)}"`)
  .replace(/url\((photos\/[^)]+)\)/g, (_, f) => `url(${photo(f)})`);

// Kredity fotiek s licenciou CC BY do pätičky (CC0 a public domain kredit nevyžadujú).
const creditsFile = path.join(SRC, 'photos', 'credits.json');
if (fs.existsSync(creditsFile)) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LABEL = { hero: 'elektrikár', kotol: 'bojler', malovanie: 'maľovanie', upratovanie: 'upratovanie', obklad: 'dlažba', stahovanie: 'balenie', zahrada: 'kosenie', elektro: 'rozvádzač' };
  const by = JSON.parse(fs.readFileSync(creditsFile, 'utf8')).filter(c => !/cc0|pdm|public/i.test(c.license || ''));
  const groups = {};
  for (const c of by) (groups[`${c.creator}|${c.license}|${c.license_url}`] ||= []).push(c);
  const parts = Object.entries(groups).map(([k, list]) => {
    const [creator, license, url] = k.split('|');
    const links = list.map(c => `<a href="${esc(c.source_url)}" rel="noopener">${esc(LABEL[c.key] || c.key)}</a>`).join(', ');
    return `${esc(creator)}, <a href="${esc(url)}" rel="noopener">${esc(license)}</a> (${links})`;
  });
  const text = parts.length ? ` Fotky: ${parts.join('; ')}; ostatné CC0 (StockSnap, Wikimedia Commons).` : ' Fotky sú voľné diela (CC0).';
  html = html.replace('<!--credits-->', text);
}

fs.writeFileSync(OUT, html);
console.log(`index.html: ${Math.round(Buffer.byteLength(html) / 1024)} KB (fotky: ${photos})`);
