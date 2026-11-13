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

## Ötletek (a fix-terv után)

- **Nettó inflow/outflow adatok megjelenítése** (felhasználó kérése, 2026-11-13). Nem része a 7 szakasznak; adatforrás még eldöntetlen (Coinalyze delta/CVD alapú nettó pénzáramlás vs. külső tőzsde in/outflow). Először forrás és képlet tisztázása, utána kijelzés.

- **7. szakasz, 1. rész – kiértékelő modul (2026-11-13).** `src/utils/backtest.js` (tiszta függvények, 16 új teszt, összesen 88 zöld): `runBacktest` (1/3/6/12 órás előretekintés, találati arány, átlagos hozam, MFE/MAE, long/short és címkénkénti bontás, alapvonal: minden gyertyán long), `evaluateSignal` (oda-vissza díj bps-ben, funding: long fizet pozitív rátánál), `correlationMatrix` (dupla beszámítás), `informationCoefficient`. Belépés a jel gyertyájának zárásán; a MFE/MAE záróárakból számolt (alulbecsli a gyertyán belüli kilengést). Még NINCS valós adaton futtatva; nincs paraméterhangolás. Következő: futtató szkript valós Coinalyze-adattal (a lekérhető history hossza korlátozza a mintát).

- **7. szakasz, 2. rész – első valós futtatás (2026-11-13).** `scripts/backtest.js` (`npx sucrase-node scripts/backtest.js [órák] [bps]`; csak olvas, a kulcsot nem írja ki). Minta: SOLUSDT_PERP.A + 3 spot, 1500 órányi (~62 nap) gyertya, 1408 snapshot a z-ablak bemelegedése után; 10 bps oda-vissza költség, funding NEM beszámítva (a ráta egysége nincs megerősítve). Címkék: 139 BULL, 110 BEAR, 1159 NEUTRAL; nincs STRONG jel.
  - **Eredmény: nincs kimutatható előny.** Az információs együttható minden horizonton és tagnál |0,00–0,06| (a mintahiba ≈ 0,027 körüli, tehát zaj). A momentum IC: 0,03 / 0,01 / 0,02 / 0,03 (1/3/6/12 h).
  - Találati arány 35–51% (a költség után); a jelek átlagos nettó hozama az alapvonal körül (long jelek 6 h: +0,03% vs. alapvonal −0,19%, de n=122 és a hozam szórása miatt ez nem szignifikáns). A jelek egymást átfedik, így a tényleges függetlenmintaszám kisebb a kiírtnál.
  - **Dupla beszámítás:** nincs erős átfedés; a legnagyobb |korreláció| a cvdSlopeZ–fundingZ (0,31) és a deltaPctZ–spotLead (−0,27). A deltaPctZ és a cvdSlopeZ gyakorlatilag független (0,01).
  - Következtetés: az alapmodell ezen a mintán nem prediktív; ez NEM ok a paraméterek hangolására (túlillesztés). Kérdés a felhasználónak: hosszabb/más minta, regime-bontás, vagy a modell szerepének újragondolása (pl. állapotleíró, nem előrejelző).
  - **Hosszabb minta (2026-11-13):** az API óránkénti adatból legfeljebb 2016 gyertyát (12 hét) ad vissza, hiába kérünk többet; a percenkénti 40 hívás nem szűk keresztmetszet (a teljes lekérés ~20 mp). Érvényes snapshot így is csak ~1470 (a hiányzó források, valószínűleg OI/likvidáció, rövidebb múltat adnak). A 2016 órás futás ugyanazt mutatja (IC 0,00–0,07, zaj). Hosszabb minta csak úgy lesz, ha a snapshotokat/nyers adatot időnként mentjük (napló).
  - **Szerepdöntés (felhasználó, 2026-11-13):** a mutató NEM előrejelző; a belépési döntés a TradingView, a LiqHeatmap és a Tapesurf adataival együtt születik. A modell állapotleíró/kontextus; nagy előrejelzést nem várunk tőle, a paramétereket nem hangoljuk.

- **Végső tesztelés: waterfall összeg (2026-11-13) – KÉSZ.** A crowding tag a maradék (`raw − base`), ezért önmagában nem bizonyít semmit; új, 2000 véletlen esetes teszt a tagokat (order flow, spot, likvidáció, crowding) a képletből függetlenül újraszámolja, és ellenőrzi az összeget is (89+ zöld). Eredmény: a waterfall helyes, nincs rejtett hiba; a likvidációs tag csak liqZ > 2-nél nem nulla és csak csökkent, a crowding sosem növeli a pontszám nagyságát. Hátra: 8,31-es z-score eredete, spot delta „B" egység.

- **Végső tesztelés: spot egység (2026-11-13).** Az utolsó 6 óra átlaga (nyers API): perp 889 416 SOL/óra, SOLUSD.A 97 534, SOLUSDC.A 24 684, SOLUSDT.F 1 653; a spot meta mindhárom piacnál base=SOL. Átlagos ügyletméret spot: ~15 SOL (≈ 1 200 USD); ha a `v` USD lenne, ez ~15 USD/ügylet és 97 ezer USD/óra Binance SOL spoton, ami irreális. Következtetés: a spot `v` is SOL (BASE), a konverzió (× záróár) helyes. A kijelzett „B": a `compact()` hu-HU formátuma E = ezer, M = millió, Mrd = milliárd, **B = billió (10^12)**, ami angol olvasatban (billion = 10^9) félrevezető; a spot delta valós nagyságrendje E–M (százezer–millió USD), tehát „B" nem valós érték, hanem hibás megjelenítés vagy félreolvasás. Még nyitott: melyik nézetben látszott a „B".
