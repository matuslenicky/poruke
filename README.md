# Poruke

Koncept slovenského trhoviska remeselníkov a služieb pre domácnosť. Vizuálne v čistom modernom business štýle (inšpirácia Thumbtack), obsahom v európskom duchu namiesto amerického modelu predaja kontaktov.

**Živá ukážka:** https://matuslenicky.github.io/poruke/

> Toto je ukážka dizajnu, nie prevádzkovaná služba. Mená majstrov, hodnotenia, ceny a čísla žiadostí sú vymyslené. Formulár zákazky ani overenie IČO nič neodosielajú, všetko zostáva v prehliadači.

## Čo koncept ukazuje

- **Najviac tri ponuky** na zákazku namiesto predaja kontaktu desiatkam firiem.
- **Ceny vrátane DPH 23 %**, prepínač s/bez DPH a orientačné ceny podľa kraja.
- **Overené IČO a oprávnenia** (napr. elektrotechnik § 22), platba priamo majstrovi na faktúru alebo s dokladom z eKasy.
- **Ochrana kontaktu (GDPR):** telefón a adresu dostane len vybraný majster; len nevyhnutné cookies, preto bez cookie lišty.
- **Transparentné radenie** (nariadenie EÚ 2019/1150) a **nahlasovanie obsahu** podľa DSA.
- Mobil ako appka: spodná lišta, vodorovné pásy kariet, formulár zákazky na celú obrazovku. Svetlý aj tmavý režim podľa systému.

## Štruktúra a build

```
src/index.html      zdroj stránky (HTML, CSS, vanilla JS)
src/fonts/          písmo Figtree orezané na latinku strednej a západnej Európy (WOFF)
src/photos/         fotky prác (JPEG) a credits.json
build.js            zloží jednosúborový index.html: vloží fonty a fotky ako data: URI
index.html          výsledok, ktorý servíruje GitHub Pages a dá sa poslať ako príloha (funguje offline)
```

```
node build.js
```

Bez závislostí, stačí Node.js.

## Písmo a fotky

- [Figtree](https://fonts.google.com/specimen/Figtree), licencia [SIL Open Font License 1.1](https://openfontlicense.org).
- Ikony [Lucide](https://lucide.dev), licencia ISC.
- Fotky sú voľné diela nájdené cez [Openverse](https://openverse.org); autori, licencie a zdroje sú v `src/photos/credits.json`, fotky s licenciou CC BY sú uvedené aj v pätičke stránky.

