# SOL momentum / order flow számítási réteg – specifikáció

Cél: a CoinAlyze API adataiból egy számítási réteg, ami megmutatja, mit ad éppen a piaci momentum. **Fókusz: Solana (SOL).** Más eszköz csak másodlagos, de a kód legyen paraméterezhető (`baseAsset = "SOL"`).

Forrás: hivatalos doksi – https://api.coinalyze.net/v1/doc/ (ellenőrizve: 2026-10-28). Ha bármi eltér a doksitól, a doksi a mérvadó.

---

## 1. API alapok (javítandó a mostani kódban)

- Base URL: `https://api.coinalyze.net/v1`
- Auth: `api_key` nevű **header** (vagy query paraméter). **Nem Bearer.**
- Rate limit: 40 hívás/perc/kulcs. 429 esetén a `Retry-After` header értékét (másodperc) kell kivárni.
- Egy kérésben max. 20 szimbólum, de **minden szimbólum 1 hívásnak számít**.
- Intraday adat (1min–12hour): csak 1500–2000 adatpont marad meg, a régit naponta törlik. Napi adat nem törlődik. → Ha hosszabb előzmény kell (backtest), lokálisan tárolni kell.
- Minden history növekvő időrendben jön. `from` / `to` UNIX másodpercben, mindkettő inclusive.
- Interval enum: `1min 5min 15min 30min 1hour 2hour 4hour 6hour 12hour daily`

**A mostani kódban használt CVD / order-flow végpontok NEM léteznek. Törölni kell őket.** A CVD az OHLCV-ből számolható (lásd 3. pont).

### Használt végpontok

| Végpont | Válasz mezők a `history` tömbben |
|---|---|
| `GET /future-markets` | symbol, exchange, base_asset, is_perpetual, margined, oi_lq_vol_denominated_in, has_long_short_ratio_data, has_ohlcv_data, has_buy_sell_data |
| `GET /spot-markets` | symbol, exchange, base_asset, has_buy_sell_data |
| `GET /open-interest` (aktuális) | symbol, value, update |
| `GET /ohlcv-history` | t, o, h, l, c, v, bv, tx, btx |
| `GET /open-interest-history` (+ `convert_to_usd`) | t, o, h, l, c |
| `GET /funding-rate-history` | t, o, h, l, c |
| `GET /predicted-funding-rate-history` | t, o, h, l, c |
| `GET /liquidation-history` (+ `convert_to_usd`) | t, l, s |
| `GET /long-short-ratio-history` | t, r, l, s |

---

## 2. SOL piacok felderítése (NE legyenek beégetett szimbólumok)

1. Indításkor (és naponta egyszer) `GET /future-markets` és `GET /spot-markets`.
2. Szűrés: `base_asset == "SOL"`.
   - Perp: `is_perpetual == true` és `has_buy_sell_data == true`
   - Spot: `has_buy_sell_data == true`
3. Rangsor: `GET /open-interest?symbols=...&convert_to_usd=true` a perp listára → top N perp piac OI szerint (kezdetben N = 5, konfigurálható).
4. Spotból a top 2–3 piac (pl. ahol USDT/USDC a quote). Ha nincs jó rangsorolási adat, maradjon konfigurálható lista, amit a felderítés tölt fel.
5. Long/short arányt csak ott kérj, ahol `has_long_short_ratio_data == true`.

### Hívás-költségvetés (40/perc alatt maradni)

Frissítésenként kb.: perp_N × (ohlcv + oi + funding + predicted_funding + liq + lsr) + spot_N × ohlcv.
N=5 perp, 3 spot → max ~33 hívás. Frissítés 5 percenként (5min gyertyánál). Kell egy egyszerű queue/limiter, ami garantálja a 40/perc alatti tempót, és 429-nél tiszteli a `Retry-After`-t.

---

## 3. Számítások gyertyánként (piaconként)

Jelölés: `c` = egy OHLCV gyertya.

> **Validálandó feltételezés:** a doksi csak a mezőneveket adja meg. Feltételezés: `bv` = taker buy volume, `tx` = kötésszám, `btx` = vételi kötésszám. Első futáskor ellenőrizni: `0 <= bv <= v` és `0 <= btx <= tx` minden gyertyán. Ha nem teljesül, logolni és jelezni, ne számoljon tovább vakon.

> **Volumen egysége:** nem dokumentált, hogy base (SOL) vagy quote (USD). Tőzsdék közötti összeadás előtt normalizálni kell USD-re. Ellenőrzés: `v × c` nagyságrendje stimmel-e a tőzsde ismert forgalmával; ha base-ben van, `vUsd = v × c`. A `oi_lq_vol_denominated_in` mező a future-markets listában segít eldönteni.

### 3.1 Order flow (OHLCV)
```
sellVol      = v - bv
delta        = bv - sellVol            // = 2*bv - v
deltaPct     = v > 0 ? delta / v : 0   // -1..+1, agresszió-egyensúly
cvd[i]       = cvd[i-1] + delta        // kumulált, az ablak elejétől
sellTx       = tx - btx
avgBuySize   = btx > 0 ? bv / btx : 0
avgSellSize  = sellTx > 0 ? sellVol / sellTx : 0
sizeSkew     = avgSellSize > 0 ? avgBuySize / avgSellSize : null   // >1: nagyobb kötések a vételi oldalon
```

### 3.2 Ár vs CVD divergencia / abszorpció (ablak: N gyertya, alap N=20)
```
priceSlope = lineáris regresszió meredeksége a close-on, normalizálva (slope / átlag close)
cvdSlope   = lineáris regresszió meredeksége a CVD-n, normalizálva (slope / átlagos |delta|)
divergence = sign(priceSlope) != sign(cvdSlope)
absorption = |zscore(deltaPct)| > 2  ÉS  |gyertya ármozgás %| < az ablak medián ármozgásának fele
```
- Bullish divergencia: ár lefelé, CVD felfelé.
- Bearish divergencia: ár felfelé, CVD lefelé.

### 3.3 Open interest + ár kvadráns
```
dOI%    = (oi.c - oi.o) / oi.o     // gyertyán belül, vagy N gyertyára
dPrice% = (c.c - c.o) / c.o
```
| dPrice | dOI | Címke | Momentum hatás |
|---|---|---|---|
| + | + | `NEW_LONGS` | erős emelkedés |
| + | − | `SHORT_COVERING` | gyengébb emelkedés |
| − | + | `NEW_SHORTS` | erős esés |
| − | − | `LONG_LIQUIDATION` | gyengébb esés |

Holtsáv: ha |dOI%| vagy |dPrice%| a saját rolling szórásának 0.25-szöröse alatt van → `NEUTRAL`.

### 3.4 Likvidációk (`convert_to_usd=true`)
```
netLiq    = s - l        // + = shortokat likvidáltak (felfelé nyom), − = longokat
liqRatio  = (l + s) / vUsd   // mekkora része a forgalomnak kényszerített
```
Ha `liqRatio` magas (zscore > 2), az aznapi delta nem organikus → a kompozitban csökkenteni kell a delta súlyát (lásd 5. pont).

### 3.5 Funding (zsúfoltság, nem irány)
```
fundingZ   = zscore(funding.c, 50)
predFundZ  = zscore(predicted_funding.c, 50)
```

### 3.6 Long/short arány (ahol van)
```
lsrZ = zscore(r, 50)
```
Kontrariánus jelzés, csak szűrőként.

---

## 4. Aggregálás SOL szintre

- **Perp delta / CVD:** USD-re normalizált delta összege az összes kiválasztott perp piacon, azonos `t`-re igazítva.
- **Spot delta / CVD:** ugyanez a spot piacokra, külön sorozatként.
- **OI:** USD OI összege; dOI% az összegből.
- **Likvidáció:** l és s összege USD-ben.
- **Funding:** OI-val súlyozott átlag a perp piacokon.
- **L/S arány:** OI-val súlyozott átlag ott, ahol van.
- Hiányzó gyertya egy piacon → az adott időpontban az a piac kimarad, de legyen egy `coverage` mező (hány piac adott adatot).

### Spot vs perp vezetés
```
spotLead = zscore(spotDeltaUsd) - zscore(perpDeltaUsd)
```
- `> +1`: spot vezeti a mozgást (egészségesebb)
- `< -1`: perp / tőkeáttétel vezeti (törékenyebb)

---

## 5. Kompozit momentum pontszám

Minden komponens rolling z-score (alap ablak: 50 gyertya), majd [-3, +3]-ra vágva.

```
orderFlow = 0.6 * z(deltaPct_perp+spot) + 0.4 * z(cvdSlope)
oiSignal  = kvadráns alapján: NEW_LONGS:+1, SHORT_COVERING:+0.5, NEW_SHORTS:-1, LONG_LIQUIDATION:-0.5, NEUTRAL:0
            szorozva min(|z(dOI%)|, 3) / 3
liqDamp   = liqZ > 2 ? 0.5 : 1                    // kényszerített flow csillapítás
crowding  = fundingZ                              // + = túlzsúfolt long

momentumRaw = liqDamp * (w1*orderFlow + w2*oiSignal*3 + w3*spotLead)
            - w4 * sign(momentumRawElőjel) * max(0, crowding*sign(momentumRawElőjel) - 1)
```
Kezdő súlyok: `w1 = 0.5, w2 = 0.25, w3 = 0.15, w4 = 0.10`.
**Ezek kezdő feltételezések, nem bizonyított értékek.** Legyenek egy config objektumban, hogy később backtesttel hangolhatók legyenek.

A crowding tag lényege: ha a momentum pozitív és a funding is erősen pozitív (z > 1), akkor csökkenti a pontszámot; negatív momentumnál negatív fundinggal ugyanez fordítva.

Kimenet skálázva: `momentum = clamp(momentumRaw / 3, -1, +1)`

Címkék:
- `> 0.5` erős bullish, `0.2..0.5` bullish, `-0.2..0.2` semleges, `-0.5..-0.2` bearish, `< -0.5` erős bearish

---

## 6. Kimeneti adatstruktúra (a dashboard ezt kapja)

```ts
type MomentumSnapshot = {
  asset: "SOL";
  interval: "5min" | "15min" | "1hour";
  t: number;                 // gyertya időbélyeg (s)
  price: number;             // OI-súlyozott vagy a legnagyobb perp záróára
  momentum: number;          // -1..+1
  label: "STRONG_BULL" | "BULL" | "NEUTRAL" | "BEAR" | "STRONG_BEAR";
  components: {
    deltaPct: number;
    cvdPerp: number;
    cvdSpot: number;
    cvdSlopeZ: number;
    divergence: "BULLISH" | "BEARISH" | null;
    absorption: boolean;
    oiQuadrant: "NEW_LONGS" | "SHORT_COVERING" | "NEW_SHORTS" | "LONG_LIQUIDATION" | "NEUTRAL";
    dOIPct: number;
    netLiqUsd: number;
    liqZ: number;
    fundingZ: number;
    predFundingZ: number;
    lsrZ: number | null;
    spotLead: number;
    sizeSkew: number | null;
  };
  coverage: { perpMarkets: number; spotMarkets: number };
  warnings: string[];        // pl. "bv > v on market X", "rate limited", "volume unit unverified"
};
```
Plusz a teljes idősor (`MomentumSnapshot[]`), hogy a dashboard grafikont tudjon rajzolni (ár + CVD perp + CVD spot + momentum).

---

## 7. Időkeretek

- Elsődleges: `5min` (kb. 5–7 nap előzmény a megőrzési limit miatt)
- Kontextus: `1hour` ugyanazzal a számítással
- Később: `daily` (ez nem törlődik, hosszabb trendhez)

---

## 8. Tesztek / ellenőrzések

- Unit teszt a delta, CVD, deltaPct, kvadráns és zscore függvényekre kézzel számolt példákkal.
- Adat-validáció minden lekérés után: `bv <= v`, `btx <= tx`, nincs NaN, időbélyegek növekvők.
- Rate limiter teszt: 429 szimulálva → vár `Retry-After`-t, újrapróbál.
- A számítási réteg legyen tiszta függvényekből álló modul (nincs benne fetch), a lekérő réteg külön.
