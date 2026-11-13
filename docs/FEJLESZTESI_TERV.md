# SOL Piaci Pulzus – fejlesztési és hibajavítási terv

Cél: a meglévő mutatók ellenőrzése és fokozatos javítása (nem újraépítés, nem kereskedési robot). A pontosság, az átláthatóság és az ellenőrizhetőség fontosabb az új funkcióknál. A korábbi elemzés kiindulópont, nem végleges specifikáció.

Kód: React/JS – `src/utils/momentum.js`, `src/services/dataFetcher.js`, `src/utils/explain.js`.

## Hátralévő szakaszok

2. **Z-score** *(kész, kivéve a 8,31 ellenőrzését, ami a végső tesztelésre marad)*
3. **CVD** *(kész, 2026-11-13)* – képlet definiálva és tesztelve, USD-konverzió közelítése dokumentálva, abszolút CVD / nyers meredekség (`cvdSlopeUsd`) / normalizált meredekség (`cvdSlopeNorm`) / z (`cvdSlopeZ`) külön mező.
4. **Divergencia és abszorpció** *(kész, 2026-11-13)* – vételi/eladási abszorpció külön (`absorptionSide`); divergencia: bullish/bearish külön, holtsáv (`divMinSlope`: ár 1e-4 relatív meredekség/gyertya, CVD 0,05 átl. |delta|/gyertya; szigorú egyenlőtlenség, a küszöbön nincs jel), legalább 10 gyertya kell; a küszöbök kezdő feltételezések, a 7. szakasz historikus tesztjén kell igazolni. Kézzel ellenőrzött meredekség-értékek és határesetek tesztelve.
5. **Open Interest** *(kész, 2026-11-13)* – natív OI (a dOI az ártól független pozícióváltozás), USD-OI súlyozás, kvadránsok, pontozás tesztelve. Holtsáv: `deadband` (0,25) × az ár-, illetve a dOI-változás 50 gyertyás szórása (az aktuális gyertyával együtt); a határérték maga is NEUTRAL (`<=`), a divergenciánál ugyanígy a küszöbön nincs jel. Pontozás: a kvadráns adja az előjelet és a súlyt (erős ±1, gyenge ±0,5), a |dOI z| (max 3) a nagyságot; a dOI z előjele nem számít. Megfigyelés: az első gyertyán a szórás 0, így a holtsáv is 0 (a kvadráns jelezhet), de a pontszámot ez nem érinti, mert ott a dOI z = 0; a z-ablak hiányát a snapshot figyelmeztetése jelzi.
6. **Likvidáció és Funding** *(kész, 2026-11-13)* – long/short likvidáció külön mező (`liqLongUsd`, `liqShortUsd`), irány (`liqDirection`: 'LONG' = longokat zártak ki, 'SHORT' = shortokat; egyenlőségnél/hiányzó adatnál null) és intenzitás (`liqZ`, iránytalan) szétválasztva; `netLiqUsd` = short − long. A funding z zsúfoltsági mutató: csak a crowding levonásban szerepel, ha a pontszám irányába zsúfolt (a meglévő tesztek ezt fedik); önálló irányjelet nem ad.
7. **Integráció és historikus teszt** – indikátorok külön tesztje, korreláció, dupla beszámítás kerülése, 1/3/6/12 órás előretekintés, találati arány, átlagos és maximális kedvezőtlen elmozdulás, költségek és funding. Paramétert nem optimalizálunk, amíg az alapmodellt nem értjük.

## Ismert nyitott problémák

- A delta z-score 8,31 értéke nem származhat ebből a kódból (50 gyertyás ablakban a maximum 7, a kijelzett érték ±3-ra vágott); az eredete a végső tesztelésnél tisztázandó (a felhasználó döntése, 2026-11-13). Az elemzés, amiben szerepelt, nem tartalmazza; egy másik gyertya adatait elemzi.
- A magyarázó nézet és a kijelzések egy része egyetlen piac gyertyájából, más része az összes perp USD-ben összegzett értékéből számol; a végső tesztnél érdemes egységesen jelölni, melyik melyik. A spot delta kijelzett egysége ("B"?) és a pontszám-összegzés (waterfall) ellenőrizendő.
- ~~A CVD meredekség z-score képlete nincs definiálva~~ → definiálva (2026-11-13): `calculateCvdSlopeNorm` = CVD regressziós meredekség / átl. |delta| (20 gyertya), arra 50 gyertyás z; a CVD abszolút értéke ablakfüggő, a normalizált meredekség nem. Tesztelve.
- ~~Az OI holtsáv numerikus küszöbei hiányoznak~~ → dokumentálva (lásd 5. szakasz); a 0,25 szorzó kezdő feltételezés, a 7. szakaszban igazolandó.
- ~~Az abszorpció nem különíti el a vételi és eladási oldalt~~ → megoldva (2026-11-13): `detectAbsorptionSide` ('BUY'/'SELL'/null), `components.absorptionSide`; a `absorption` bool megmaradt; megfigyelés, nem fordulójel.
- ~~A likvidáció z-score előjele nem mutatja a long/short irányt~~ → a z szándékosan iránytalan (intenzitás); az irányt a `liqDirection` adja, a kijelzések mindkettőt mutatják.
- A CVD abszolút értéke függ a számítási ablaktól (kijelzésnél jelezve; az irányt a normalizált meredekség adja).
- A USD-konverzió `delta × záróár` közelítés (2026-11-13 döntés: marad, dokumentálva a kódban és az `explain.js`-ben); a pontos érték a gyertya átlagára lenne, az API nem ad VWAP-ot. Netes keresés nem talált előíró forrást. Ha később érdemes, tipikus árral `(h+l+c)/3` összevethető. A Coinalyze doksi `v`/`bv` egységleírása nem volt elérhető (az oldal kliensoldali).
- A spot piacok USD-egysége közvetlenül nincs megerősítve (spot OHLCV USD-ben lekérve); a mérések a BASE (SOL) feltevéssel konzisztensek.

## Munkaszabályok

Egyszerre egy hiba; módosítás előtt kód és forrásadat vizsgálata; képletek matematikai ellenőrzése; teszt minden módosításhoz; régi/új eredmény összevetése; működő részt nem változtatunk indokolatlanul; az eredeti verziót nem őrizzük, a módosítások közvetlenül felülírják a kódot (a felhasználó döntése, 2026-11-13); módosítások dokumentálása.

## Elkészült

- **1. szakasz – nyers adat és konzisztencia (2026-11-04).** A 80 SOL-os eltérés nem kódhiba volt (elírás a korábbi ellenőrző oszlopban). `validateCandles` a `prepareMarket`-ben fut, a hibás piac kimarad figyelmeztetéssel; a spot `v` SOL-egységben jön.
- **2. szakasz (2026-11-13).** Nyers delta z megőrizve (`components.deltaPctZRaw`) és az `explain.js`-ben a vágott mellett látszik; nulla szórás és hiányos ablak tesztelve; az abszorpció a nyers (vágatlan) z-t használja, ez az `explain.js`-ben jelezve van. A z-score matematikai maximuma 50 elemű ablakban √49 = 7.
