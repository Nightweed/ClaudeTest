# CLAUDE.md

## A felhasználóról és a munkamódról
- **Nyelv:** magyarul kommunikálunk (válaszok, UI-szövegek, dokumentáció, commit-üzenetek angolul is mehetnek).
- **Cél:** megbízható, ellenőrizhető SOL piaci elemző felület. A felhasználó nem kereskedési robotot kér; a belépési döntést ő hozza meg a TradingView, a LiqHeatmap és a Tapesurf adataival együtt. A mutató állapotleíró/kontextus, NEM előrejelző (a historikus teszt sem mutatott előrejelző erőt), nagy előrejelzést nem várunk tőle.
- **Pontosság > új funkció.** A korábbi elemzés kiindulópont, nem végleges.
- **Munkaszabályok:** egyszerre egy hiba; módosítás előtt kód és forrásadat vizsgálata; képletek matematikai ellenőrzése; teszt minden módosításhoz; régi/új eredmény összevetése; működő részt indokolatlanul nem változtatunk; változások dokumentálása a `docs/FEJLESZTESI_TERV.md`-ben.
- **Moduláris gondolkodás (fontos!):** minden új funkció külön, önálló modul legyen, egyetlen felelősséggel, a meglévő kód érintése nélkül bővíthető. A számítás (tiszta függvények, nincs benne fetch vagy UI) legyen elválasztva a lekéréstől, a megjelenítéstől és a szöveges magyarázattól; az adatforrások cserélhetők legyenek (pl. a későbbi inflow/outflow forrás ne kösse meg a számítási magot). Egy komponens vagy függvény ne csináljon több dolgot; ha nő, bontsuk szét. Újrahasználjuk a meglévő elemeket (`Card`, `Section`, `Info`, `format.js`, `glossary.js`) ahelyett, hogy duplikálnánk. Minden modulhoz külön teszt tartozzon. Új mutató felvétele: a számítás a `momentum.js`-ben vagy külön `utils` modulban, a magyarázata a `glossary.js`/`explain.js`-ben, a megjelenítése külön komponensben.
- **Paramétert nem hangolunk** a mintán (túlillesztés); a súlyok és küszöbök kezdő feltételezések.
- **Git:** közvetlenül a `main`-re dolgozunk, nincs külön fix-ág, az eredeti verziót nem kell őrizni (felülírható). Commit és push csak kérésre; ha a felhasználó azt kéri, hogy „pusholj fel mindent", mehet egyben. Az `.env` (API-kulcs) soha nem kerül be a repóba.
- **Stílus:** rövid, lényegre törő válaszok, őszinte beszámoló (ha valami nincs ellenőrizve, azt kimondjuk). A felhasználó szereti a kreatív, jól kinéző megoldásokat, és a tooltip-szerű magyarázatokat („minden legyen tiszta").

## Projekt
React (CRA) + tiszta JS; adatforrás a Coinalyze API (a dev szerver proxyja továbbítja, kulcs: `REACT_APP_COINALYZE_API_KEY` a `.env`-ben).
- `src/utils/momentum.js` – a számítási mag (z-score, CVD, divergencia, abszorpció, OI kvadráns, likvidáció, funding, kompozit pontszám). Csak tiszta függvények.
- `src/utils/explain.js`, `waterfall.js`, `dashboardData.js`, `glossary.js` – magyarázó nézet, pontszám-bontás, kijelzési segédek, ⓘ szótár.
- `src/utils/backtest.js` + `scripts/backtest.js` – historikus kiértékelés valós adaton (`npx sucrase-node scripts/backtest.js [órák] [bps]`).
- `src/services/dataFetcher.js` – lekérések (40 hívás/perc limit, `rateLimit.js`).
- `src/components/` – felület (`Dashboard`, `OverviewTab`, `CalcTab`, `Hero`, `charts/`); stílus: `Dashboard.css` (tokenek, reszponzív réteg a fájl végén).
- Alapértelmezett piacok: perp `SOLUSDT_PERP.A`, spot `SOLUSD.A, SOLUSDC.A, SOLUSDT.F`, 1 órás gyertyák.

## Tudnivalók (ellenőrzött tények)
- A `v` (volumen) perpen és spoton is SOL (BASE) egységben jön; az USD-érték `delta × záróár` közelítés (nincs VWAP az API-ban).
- Az API óránkénti adatból max. 2016 gyertyát (12 hét) ad; az érvényes snapshot ~1470. Hosszabb mintához a snapshotokat naplózni kellene.
- A hu-HU tömör számformátumban **B = billió (10^12)**, Mrd = milliárd; a felületen jelmagyarázat van rá.
- A z-score maximuma 50 gyertyás ablakban √49 = 7; a pontszámba ±3-ra vágva kerül. A 8,31-es korábbi érték nem reprodukálható (emlékeztető: friss adatokkal figyelni).
- A gyertya `t` ideje a NYITÁSI idő; csak lezárt gyertyára számolunk.
- Funding-ráta egysége nincs megerősítve (a backtestben ezért nincs beszámítva).

## Parancsok
- Tesztek: `CI=true npx react-scripts test --watchAll=false`
- Build: `npx react-scripts build`
- Fejlesztői szerver: `npm start`
- Reszponzív ellenőrzés: headless Edge eszközemulációval (a sima `--window-size` keskeny ablaknál félrevezető, mert a minimális szélesség ~500 px).

## Nyitott ötletek
- Nettó inflow/outflow adatok megjelenítése (az adatforrás még eldöntetlen: Coinalyze delta/CVD alapú vagy külső tőzsdei in/outflow).
- Snapshot-napló hosszabb historikus teszthez.
- Valódi telefonos próba; világos téma és fekvő telefon ellenőrzése.
