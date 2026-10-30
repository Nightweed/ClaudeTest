# SOL Piaci Pulzus – fejlesztési és hibajavítási terv

Cél: a meglévő mutatók ellenőrzése és fokozatos javítása (nem újraépítés, nem kereskedési robot). A pontosság, az átláthatóság és az ellenőrizhetőség fontosabb az új funkcióknál. A korábbi elemzés kiindulópont, nem végleges specifikáció.

Kód: React/JS – `src/utils/momentum.js`, `src/services/dataFetcher.js`, `src/utils/explain.js`.

## Szakaszok

1. **Nyers adat és konzisztencia** – `volume = buy + sell`, `delta = buy - sell`, `delta% = delta / volume`; kerekítési tolerancia dokumentálása; hiányzó/duplikált gyertyák, időbélyegek, SOL/USD értékek.
2. **Z-score** – 50 gyertyás ablak, átlag/szórás, nulla szórás; `raw_z`, `capped_z` (±3), `z_signal` szétválasztása; a nyers érték nem vész el.
3. **CVD** – számítás, USD-konverzió, ablak, 20 gyertyás regresszió, normalizálás, meredekség z-score ablaka; abszolút érték, meredekség és normalizált meredekség külön mutató.
4. **Divergencia és abszorpció** – ár- és CVD-meredekség, numerikus holtsáv, bullish/bearish szétválasztás; vételi és eladási abszorpció külön indikátor, nem automatikus fordulójel.
5. **Open Interest** – natív OI, USD-súlyozás, változás, ár- és OI-holtsáv, kvadránsok (új longok / új shortok / short covering / longzárás, holtsávon belül NEUTRAL), pontozás tesztelése.
6. **Likvidáció és Funding** – long/short/összes likvidáció, likvidáció/forgalom, z-score; irány és intenzitás külön. A funding zsúfoltsági mutató, nem önálló irányjel.
7. **Integráció és historikus teszt** – indikátorok külön tesztje, korreláció, dupla beszámítás kerülése, 1/3/6/12 órás előretekintés, találati arány, átlagos és maximális kedvezőtlen elmozdulás, költségek és funding. Paramétert nem optimalizálunk, amíg az alapmodellt nem értjük.

## Ismert nyitott problémák

- A delta z-score 8,31, a dokumentáció ±3 tartományt említ.
- A CVD meredekség z-score képlete nincs teljesen definiálva.
- Az OI holtsáv numerikus küszöbei hiányoznak a dokumentációból.
- Az abszorpció nem különíti el a vételi és eladási oldalt.
- A likvidáció z-score előjele nem mutatja a long/short irányt.
- A CVD abszolút értéke függ a számítási ablaktól.

## Munkaszabályok

Egyszerre egy hiba; módosítás előtt kód és forrásadat vizsgálata; képletek matematikai ellenőrzése; teszt minden módosításhoz; régi/új eredmény összevetése; működő részt nem változtatunk indokolatlanul; az eredeti verzió megmarad (git); módosítások dokumentálása.

## Állapot

**1. szakasz – részben kész (2026-10-30).** A 80 SOL-os eltérés nem kódhiba. A nyers Coinalyze-adat (`SOLUSDT_PERP.A`, 1h, UTC 08:00 = 09:00 CET): `v` = 564 307,18 (nem 564 387,18; elírás volt), `bv` = 275 625,54, eladási volumen 288 681,64, delta −13 056,10, delta % −2,314%. Az alkalmazás értékei helyesek.

Hátra: automatikus validációs réteg (`validateCandles` mellé) tesztekkel; spot és USD-értékek ellenőrzése nyers adaton. Utána a 2. szakasz.
