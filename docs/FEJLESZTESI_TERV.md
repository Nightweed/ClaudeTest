# SOL Piaci Pulzus – fejlesztési és hibajavítási terv

Cél: a meglévő mutatók ellenőrzése és fokozatos javítása (nem újraépítés, nem kereskedési robot). A pontosság, az átláthatóság és az ellenőrizhetőség fontosabb az új funkcióknál. A korábbi elemzés kiindulópont, nem végleges specifikáció.

Kód: React/JS – `src/utils/momentum.js`, `src/services/dataFetcher.js`, `src/utils/explain.js`.

## Hátralévő szakaszok

2. **Z-score** *(kész, kivéve a 8,31 ellenőrzését, ami a végső tesztelésre marad)*
3. **CVD** – számítás, USD-konverzió, ablak, 20 gyertyás regresszió, normalizálás, meredekség z-score ablaka; abszolút érték, meredekség és normalizált meredekség külön mutató.
4. **Divergencia és abszorpció** – ár- és CVD-meredekség, numerikus holtsáv, bullish/bearish szétválasztás; vételi és eladási abszorpció külön indikátor, nem automatikus fordulójel.
5. **Open Interest** – natív OI, USD-súlyozás, változás, ár- és OI-holtsáv, kvadránsok (új longok / új shortok / short covering / longzárás, holtsávon belül NEUTRAL), pontozás tesztelése.
6. **Likvidáció és Funding** – long/short/összes likvidáció, likvidáció/forgalom, z-score; irány és intenzitás külön. A funding zsúfoltsági mutató, nem önálló irányjel.
7. **Integráció és historikus teszt** – indikátorok külön tesztje, korreláció, dupla beszámítás kerülése, 1/3/6/12 órás előretekintés, találati arány, átlagos és maximális kedvezőtlen elmozdulás, költségek és funding. Paramétert nem optimalizálunk, amíg az alapmodellt nem értjük.

## Ismert nyitott problémák

- A delta z-score 8,31 értéke nem származhat ebből a kódból (50 gyertyás ablakban a maximum 7, a kijelzett érték ±3-ra vágott); az eredete a végső tesztelésnél tisztázandó (a felhasználó döntése, 2026-11-13). Az elemzés, amiben szerepelt, nem tartalmazza; egy másik gyertya adatait elemzi.
- A magyarázó nézet és a kijelzések egy része egyetlen piac gyertyájából, más része az összes perp USD-ben összegzett értékéből számol; a végső tesztnél érdemes egységesen jelölni, melyik melyik. A spot delta kijelzett egysége ("B"?) és a pontszám-összegzés (waterfall) ellenőrizendő.
- ~~A CVD meredekség z-score képlete nincs definiálva~~ → definiálva (2026-11-13): `calculateCvdSlopeNorm` = CVD regressziós meredekség / átl. |delta| (20 gyertya), arra 50 gyertyás z; a CVD abszolút értéke ablakfüggő, a normalizált meredekség nem. Tesztelve.
- Az OI holtsáv numerikus küszöbei hiányoznak a dokumentációból.
- Az abszorpció nem különíti el a vételi és eladási oldalt.
- A likvidáció z-score előjele nem mutatja a long/short irányt.
- A CVD abszolút értéke függ a számítási ablaktól.
- A spot piacok USD-egysége közvetlenül nincs megerősítve (spot OHLCV USD-ben lekérve); a mérések a BASE (SOL) feltevéssel konzisztensek.

## Munkaszabályok

Egyszerre egy hiba; módosítás előtt kód és forrásadat vizsgálata; képletek matematikai ellenőrzése; teszt minden módosításhoz; régi/új eredmény összevetése; működő részt nem változtatunk indokolatlanul; az eredeti verziót nem őrizzük, a módosítások közvetlenül felülírják a kódot (a felhasználó döntése, 2026-11-13); módosítások dokumentálása.

## Elkészült

- **1. szakasz – nyers adat és konzisztencia (2026-11-04).** A 80 SOL-os eltérés nem kódhiba volt (elírás a korábbi ellenőrző oszlopban). `validateCandles` a `prepareMarket`-ben fut, a hibás piac kimarad figyelmeztetéssel; a spot `v` SOL-egységben jön.
- **2. szakasz (2026-11-13).** Nyers delta z megőrizve (`components.deltaPctZRaw`) és az `explain.js`-ben a vágott mellett látszik; nulla szórás és hiányos ablak tesztelve; az abszorpció a nyers (vágatlan) z-t használja, ez az `explain.js`-ben jelezve van. A z-score matematikai maximuma 50 elemű ablakban √49 = 7.
