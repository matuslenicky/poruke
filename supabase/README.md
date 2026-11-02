# Poruke + Supabase

Web je statický (GitHub Pages) a so Supabase hovorí priamo z prehliadača cez REST. Používa iba **verejný kľúč** (publishable, `sb_publishable_…`), ktorý je v `src/index.html` (`DB_URL`, `DB_KEY`). Čo smie web čítať a zapisovať, určujú pravidlá RLS v `schema.sql`, zapnuté na všetkých tabuľkách. Secret ani service role kľúč do webu nikdy nepatrí.

Projekt: `pcoajyawqgbuczwywzfv` (eu-west-1, Írsko), založený v dashboarde. `schema.sql` a `seed.sql` boli spustené v SQL Editore (rola postgres). Pomocné funkcie (`private.poruke_pred_vlozenim`, `private.zakazka_prijima_fotku`) sú v schéme `private`, ktorú REST API nesprístupňuje, takže sa nedajú volať ako `/rpc/…`.

| Tabuľka | Web smie | Obsah |
| --- | --- | --- |
| `majstri` | čítať | 65 ilustračných majstrov a firiem. `aktivny = false` majstra skryje. |
| `fotky_realizacii` | čítať | Fotky v profile. `obrazok` je kľúč súboru (`pf-kovac-1` = `photos/pf-kovac-1.jpg`) alebo https adresa. |
| `hodnotenia` | čítať | Prvé tri podľa `poradie` sa ukážu v profile. |
| `zakazky` | len vložiť | Žiadosti o ponuku z formulára. Osobné údaje číta len správca v Supabase. |
| `firmy_zaujem` | len vložiť | IČO a e-mail z „Pre firmy“. |
| Storage `zakazky-fotky` | len nahrať | Súkromný bucket, `<id žiadosti>/<1–5>.jpg`, iba 15 minút po žiadosti, najviac 5 MB. |

Limity: 5 žiadostí a 5 registrácií z jednej IP za 10 minút, 300 žiadostí za hodinu celkovo. IP sa neukladá, len jej pseudonymizovaný odtlačok (sha256 s tajnou soľou z tabuľky `private.nastavenia`, ktorá vznikne náhodne v databáze), a ten sa po hodine vymaže.

## Súbory

- `schema.sql` vytvára tabuľky, práva, RLS, triggery a bucket. Opakované spustenie nevadí.
- `seed.sql` obsahuje počiatočné dáta. Vygeneruje ich `node supabase/gen-seed.js` z aktuálnej stránky (zmaže a znova vloží majstrov).
- `provision.js` založí projekt `poruke` (Frankfurt) alebo s `--ref <ref>` použije existujúci, spustí oba SQL súbory a vypíše URL a verejný kľúč. Token berie z `SUPABASE_ACCESS_TOKEN` alebo `~/.poruke/supabase-token`, nikdy nie z repozitára. Token musí mať oprávnenia Database read + write a API gateway keys read. Bez nich vložte `schema.sql` a `seed.sql` do SQL Editora ručne.

## Overené naostro (2. 11. 2026)

S verejným kľúčom: majstri, fotky a hodnotenia sa dajú čítať; žiadosti a záujem firiem nie (401), ani vlastná hneď po vložení; meniť alebo mazať majstrov a hodnotenia nejde; bez súhlasu ani s vlastným `stav` sa žiadosť nevloží; `/rpc/` pomocných funkcií vracia 404. Fotka sa nahrá len k existujúcej žiadosti do jej počtu fotiek, prepísať, stiahnuť ani vypísať zoznam súborov nejde. Šiesta žiadosť z jednej IP do 10 minút skončí hláškou o príliš veľa žiadostiach.

## Správanie stránky

- `html[data-db]`: `off` (bez konfigurácie alebo s `?nodb`), `wait`, `ok` (majstri z DB), `fallback` (DB neodpovedala, ostali údaje zo stránky, takže zoznam ani profily nie sú nikdy prázdne).
- Žiadosť: `POST /rest/v1/zakazky`, potom fotky (zmenšené na 1600 px, JPEG). Počas odosielania má `#next` text „Odosielam…“. Pri chybe ostane krok 3 a zobrazí sa `#e-send`. Skryté pole `#f-web` slúži ako pasca na roboty.
- IČO: po platnom IČO sa ukáže `#ico-more` (e-mail), potom `POST /rest/v1/firmy_zaujem`.
- Testy (`tests/run.js`) pridávajú `?nodb` a Supabase v Playwright blokujú, takže do ostrej databázy nič nezapíšu.

## Kde sú žiadosti

Supabase → projekt `poruke` → Table Editor → `zakazky` (fotky: Storage → `zakazky-fotky` → priečinok s id žiadosti). Poruke je koncept, žiadosti sa skutočným majstrom neposielajú, preto ich priebežne mažte.
