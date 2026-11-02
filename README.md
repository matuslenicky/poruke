# Poruke

Koncept slovenského trhoviska remeselníkov a služieb pre domácnosť. Vizuálne v čistom modernom business štýle (inšpirácia Thumbtack), obsahom v európskom duchu namiesto amerického modelu predaja kontaktov.

**Živá ukážka:** https://matuslenicky.github.io/poruke/

> Toto je ukážka dizajnu, nie prevádzkovaná služba. Mená majstrov, hodnotenia, ceny a čísla žiadostí sú vymyslené. Formulár zákazky ani overenie IČO nič neodosielajú, všetko zostáva v prehliadači.

## Čo koncept ukazuje

- **Najviac tri ponuky** na zákazku namiesto rozposielania žiadosti desiatkam firiem.
- **Obchodný model:** zákazník neplatí nič. Remeselník platí za zákazku (ilustračne 3 / 7 / 15 € bez DPH podľa veľkosti), až keď na ňu pošle ponuku; zákazku dostanú najviac traja, za falošnú alebo zrušenú zákazku sa vracia kredit, žiadne predplatné ani platené pozície.
- **Ceny vrátane DPH 23 %**, prepínač s/bez DPH a orientačné ceny podľa kraja.
- **Overené IČO a oprávnenia** (napr. elektrotechnik § 22), platba priamo majstrovi na faktúru alebo s dokladom z eKasy.
- **Ochrana kontaktu (GDPR):** telefón a adresu dostane len vybraný majster; len nevyhnutné cookies, preto bez cookie lišty.
- **Transparentné radenie** (nariadenie EÚ 2019/1150) a **nahlasovanie obsahu** podľa DSA.
- Mobil ako appka: spodná lišta, vodorovné pásy kariet, formulár zákazky na celú obrazovku. Vždy svetlá (biela) téma, aj keď má telefón zapnutý tmavý režim.

## Štruktúra a build

```
src/index.html      zdroj stránky (HTML, CSS, vanilla JS)
src/fonts/          písmo Figtree orezané na latinku strednej a západnej Európy (WOFF)
src/photos/         fotky prác (JPEG) a credits.json
build.js            zloží index.html (web) a poruke.html (offline, jeden súbor)
index.html          výsledok pre web (GitHub Pages): fonty vložené, fotky ako súbory zo src/photos
poruke.html         rovnaká stránka na poslanie ako príloha: všetko vložené, funguje offline
```

```
node build.js
```

Bez závislostí, stačí Node.js.

## Písmo a fotky

- [Figtree](https://fonts.google.com/specimen/Figtree), licencia [SIL Open Font License 1.1](https://openfontlicense.org).
- Ikony [Lucide](https://lucide.dev), licencia ISC.
- Fotky sú voľné diela zo [StockSnap](https://stocksnap.io) (CC0) a [Wikimedia Commons](https://commons.wikimedia.org) (CC0, CC BY 2.0); autori, licencie a zdroje sú v `src/photos/credits.json`, fotky s licenciou CC BY sú uvedené aj v pätičke stránky.

