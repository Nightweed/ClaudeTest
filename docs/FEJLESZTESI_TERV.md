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

Egyszerre egy hiba; módosítás előtt kód és forrásadat vizsgálata; képletek matematikai ellenőrzése; teszt minden módosításhoz; régi/új eredmény összevetése; működő részt nem változtatunk indokolatlanul; az eredeti verziót nem őrizzük, a módosítások közvetlenül felülírják a kódot (a felhasználó döntése, 2026-11-13); módosítások dokumentálása.

## Állapot

**1. szakasz – kész (2026-11-04).**

- **Eltérés vizsgálata (2026-10-30):** a 80 SOL-os eltérés nem kódhiba. A nyers Coinalyze-adat (`SOLUSDT_PERP.A`, 1h, UTC 08:00 = 09:00 CET): `v` = 564 307,18 (nem 564 387,18; elírás volt), `bv` = 275 625,54, eladási volumen 288 681,64, delta −13 056,10, delta % −2,314%. Az alkalmazás értékei helyesek.
- **Automatikus validáció:** `validateCandles` (`src/utils/momentum.js`) a `prepareMarket`-ben fut; a hibás piac kimarad és figyelmeztetést ad. A `momentum.test.js` 9 validációs tesztet tartalmaz; a teljes csomag 48/48 zöld.
- **Spot és USD ellenőrzés nyers adaton (2026-11-04, az utolsó 6 órás 1h gyertyák):**
  - A SOL/USD, SOL/USDC és SOL/USDT (F) spot piacok `v` mezője a bázis asset (SOL) egységében érkezik. Erre utal, hogy a `v × c` a SOLUSD.A-nál ~4–6,5 M USD/óra, ami a SOL-egységgel konzisztens, míg USD-egységként néhány száz SOL/óra lenne, ami egy nagy spot pairnél irreális.
  - Minden vizsgált gyertyán teljesül: `bv ≤ v`, `btx ≤ tx`, és a számítás `sell = v − bv` definíció szerint adja az eladási oldalt.
  - Nyitott megjegyzés: a spot piacoknak nincs `oi_lq_vol_denominated_in` mezőjük, ezért a kód BASE-t feltételez. A feltevés a mérésekkel konzisztens, de közvetlen megerősítés (spot OHLCV USD-ben lekérve) még hiányzik.

**2. szakasz – folyamatban (2026-11-13).**

- Az app a pontszámba és a kijelzőre ±3-ra vágott z-t ad (`zn()`), a vágatlan érték eddig nem volt elérhető.
- 50 gyertyás ablakban, populációs szórással a z-score matematikai maximuma √49 = 7, így a 8,31 ebből a kódból nem származhat; az eredete (külső elemzés, más ablak vagy szóráskonvenció) még nyitott.
- Kész: `components.deltaPctZRaw` (nyers delta z) + 2 teszt; a teljes csomag 53/53 zöld.
- Következő: nyers/vágott z megjelenítése az `explain.js`-ben; a 8,31 eredetének tisztázása; abszorpció a vágatlan z-t használja (dokumentálandó).
