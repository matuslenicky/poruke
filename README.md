# Poruke

Koncept slovenského trhoviska remeselníkov a služieb pre domácnosť, navrhnutý v európskom duchu namiesto amerického modelu predaja kontaktov.

**Živá ukážka:** https://matuslenicky.github.io/poruke/

> Toto je ukážka dizajnu, nie prevádzkovaná služba. Mená majstrov, hodnotenia, ceny a čísla žiadostí sú vymyslené. Formulár zákazky ani overenie IČO nič neodosielajú, všetko zostáva v prehliadači.

## Čo koncept ukazuje

- **Najviac tri ponuky** na zákazku namiesto predaja kontaktu desiatkam firiem.
- **Ceny vrátane DPH 23 %**, prepínač s/bez DPH a orientačné ceny podľa kraja.
- **Overené IČO a oprávnenia** (napr. elektrotechnik § 22), platba priamo majstrovi na faktúru alebo s dokladom z eKasy.
- **Ochrana kontaktu (GDPR):** telefón a adresu dostane len vybraný majster; len nevyhnutné cookies, preto bez cookie lišty.
- **Transparentné radenie** (nariadenie EÚ 2019/1150) a **nahlasovanie obsahu** podľa DSA.
- Mobil ako appka: spodná lišta, formulár zákazky na celú obrazovku. Svetlý aj tmavý režim podľa systému.

## Ako to funguje technicky

Jeden súbor `index.html` bez buildu a bez závislostí: HTML, CSS a vanilla JavaScript. Fonty sú vložené priamo v súbore, takže stránka funguje aj offline a dá sa poslať ako príloha.

Overené nástrojom na audit (Chrome, desktop 1400 px a telefón 390 px, svetlý aj tmavý režim, axe-core): bez chýb. Lighthouse na mobile: výkon 96, prístupnosť 100, osvedčené postupy 100, SEO 100.

## Písma

- [Familjen Grotesk](https://fonts.google.com/specimen/Familjen+Grotesk) a [Fira Sans](https://fonts.google.com/specimen/Fira+Sans), obe pod licenciou [SIL Open Font License 1.1](https://openfontlicense.org). V súbore sú orezané na znaky latinky strednej a západnej Európy.
- Ikony sú vlastné SVG.
