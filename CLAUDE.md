# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # concurrently: Express on :5175 + Vite dev server on :5173 (open :5173)
npm run build    # Vite build -> dist/
npm start        # Express only on :5175, also serves dist/ if it exists
```

There is no test suite, linter, or formatter configured. `API_PORT` overrides the server port
(the Vite proxy in [vite.config.js](vite.config.js) hardcodes `http://localhost:5175`, so
changing it also means changing the proxy).

The standalone converter under [tcg_to_riftgg/](tcg_to_riftgg/) is a separate Python CLI:

```bash
python tcg_to_riftgg/tcg_to_riftgg.py                  # input/*.csv -> output/*_riftgg.csv
python tcg_to_riftgg/tcg_to_riftgg.py --format legacy
```

It predates the web app and duplicates logic now living in
[client/src/lib/importExport.js](client/src/lib/importExport.js); the app's import dialog is the
primary path. Keep the two in mind together when set codes or TCGplayer column handling change.

## Architecture

Local-first single-user app. React (Vite) SPA in [client/](client/), Express API in
[server/](server/), and **all persistence is JSON files under `data/`** (gitignored) — no
database, no accounts. The server exists mainly to (a) own the files and (b) proxy the two
external sources so the browser doesn't hit CORS.

### Server ([server/](server/))

- [server/store.js](server/store.js) — the only filesystem layer. Every read/write goes through
  `readJson`/`writeJson`/`listJson`/`deleteJson`, all relative to `data/`. Writes are
  write-tmp-then-rename. Missing files return the fallback rather than throwing, so the app boots
  with an empty `data/`.
- [server/cards.js](server/cards.js) — fetches the DotGG indexed API
  (`api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed`) and flattens its
  `{names: [...], data: [[...]]}` column-index format into card objects. Cached forever in
  `data/cards.json` and **only re-fetched when the user presses "Update prices"** (`POST
  /api/prices/refresh`) — prices and card data refresh together, there is no separate price feed.
  The endpoint is a **full dump that ignores query params** (`&set=Origins` still returns all
  1383), so every filter in the UI is client-side and adding one costs nothing at the API.
  This mapper deliberately keeps a **subset of the API's 37 fields**. Surfacing a new one is a
  three-step change that is easy to half-do: add it here, **restart the Express process** (Vite
  hot-reloads, node does not), then `POST /api/prices/refresh` to rewrite the cache. Skipping
  either of the last two leaves the field `undefined` and the new filter silently matching
  nothing. Unused-but-available fields include `cmPrice`/`cmFoilPrice` (Cardmarket, EUR),
  the `delta*` price-movement columns, `cmurl` (the Cardmarket link), and `hasback`. `cycle`
  is empty for every card. `flavor` and `marketIds` (mapped as `marketId`, the TCGplayer product
  id behind `tcgPlayerUrl`) are read only by the card detail popup, and both are missing on a
  large minority of printings — 710 have no flavour text, 121 no market id.
- [server/riftdecks.js](server/riftdecks.js) — HTML scraping of riftdecks.com. Two shapes:
  legends parsed with cheerio out of `tr[data-href*="/legends/"]` (`data-metashare`,
  `data-winrate`, `data-totaldecks` attributes), and per-legend card usage regex-extracted from
  the `var DATA = [...]` array embedded in each meta-map page. Card ids are reconstructed from
  image filenames (`.../ogn-039a-298_cropped.png` → `OGN-039a`). Results cache to
  `data/meta-cache/`; `?refresh=1` bypasses the cache. **These parsers are the fragile part of
  the codebase** — they break whenever riftdecks.com changes markup, and `getLegends` throws a
  deliberate "page may have changed" error when it finds zero rows.
- [server/index.js](server/index.js) — thin routes only, no business logic. The `handle()` wrapper
  turns a thrown error into a 500 `{error}`; the client surfaces that string verbatim.
  `collection.json`, `wishlist.json`, and `tags.json` are three copies of the same
  `GET`/`PUT {cards}` shape — adding a fourth store means copying that pair and nothing else.

### Client ([client/](client/))

- [client/src/state.jsx](client/src/state.jsx) — single `AppProvider` context holding cards,
  collection, wishlist, tags, and decks. Loads all five in parallel on mount. Mutations are
  optimistic and **saved on a 600ms debounce**; because `setState` updaters are async, the latest
  snapshot is kept in a `next*Ref` so a debounced save never posts stale data. Any new mutation
  must follow that pattern — each store that has more than one mutator needs its own ref, or two
  mutations inside one debounce window will post the older snapshot.
- Collection shape is `{ [cardId]: { normal, foil } }`, and an entry that reaches 0/0 is deleted
  rather than kept — code reading the collection must tolerate missing keys. Both `setQty` and
  `mergeCollection` uphold that: `mergeCollection` takes **signed** deltas (rapid entry's `-3`), so
  it clamps at 0 and prunes exactly like `setQty` does.
- Wishlist shape is `{ [cardId]: count }`. Entries written before it grew quantities are the
  literal `true`; **read it through `wishlistQty`**, which treats `true` as 1, rather than
  migrating the file. Starring a card wishlists what a playset is short by, floored at 1 —
  `playsetTarget` returns **0 for Runes**, so without the floor starring a rune unstars it.
- Decks live in context purely so the collection page can show `[In Deck]`. They are not
  auto-refetched: `reloadDecks()` must be called after any deck save or delete.
- [client/src/lib/cards.js](client/src/lib/cards.js) — domain constants and pure helpers
  (colors, rarities, `SET_CODE_BY_NAME`, `normName` for fuzzy name matching, `playsetTarget`,
  `collectionValue`), plus the printing, pricing, and legality predicates described below.
  Anything reusable and non-visual belongs here or in `lib/deck.js`, not in a page.
- Three indexes are built once in `state.jsx` and passed through context rather than recomputed per
  filter pass: `ownedIndex` (`buildOwnedIndex`, folds owned copies across printings),
  `keywordIndex` (`buildKeywordIndex`, parses keywords out of effect text), and `inDeckIndex`
  (`buildInDeckIndex`, cardId → deck names).
- [client/src/lib/deck.js](client/src/lib/deck.js) — deck model and rules. A deck is
  `{ legend, champion, battlefields, runes, main, side, bench }` where the zone fields are
  `{cardId: count}` maps; `ZONES` holds the limits and `addCard` enforces them (silently returning
  the unchanged deck when a limit is hit). `deckEntries()` is the canonical way to iterate a deck.
  Also owns the plain-text deck format (bare `Section:` headers + `3 Card Name`), and
  `moveCard(deck, cardId, zone, ±1)`, which walks one copy along `ZONE_LADDER`
  (`bench → side → main`) behind the deck panel's ↑/↓ buttons. It **removes before it adds**, so
  the destination's limit check does not count the copy the move is vacating, and returns the deck
  untouched when `addCard` refuses — a blocked move must never eat the copy it was carrying.
  Battlefields and Runes sit outside the ladder and get no arrows. `canMoveCard` is the same call
  used to disable the button rather than offer one that does nothing.
- [client/src/lib/cardText.js](client/src/lib/cardText.js) — rules text is light HTML with two
  kinds of inline token, and `parseCardText` turns one `effect` string into blocks of parts so
  [CardText](client/src/components/CardText.jsx) can render keywords as badges and icon codes as
  CSS symbols. Icon codes are `rb_might`, `rb_exhaust`, `rb_energy_<n>` and `rb_rune_<domain>`
  (plus `rb_rune_rainbow`, "a rune of any domain"). Two traps: `[&gt;]` and `[&gt;&gt;]` are
  bracketed **arrows**, not keywords, and reminder text inside `<em>` still carries icon codes, so
  an `em` part holds parsed parts rather than a string. Everything is data — the reference art in
  [icons/](icons/) is still unused, the symbols are drawn in CSS.
- [client/src/lib/tags.js](client/src/lib/tags.js) — card tags, stored per **printing id** in
  `data/tags.json` as `{ cardId: ["Keep", …] }`, matching the collection rather than the folded
  deck identity. Three kinds share one filter control but not one display: custom tags and the
  derived `Wishlisted` / `In Deck` render as chips, while the **128 DotGG API tags (regions,
  creature types, champion names) are filterable but deliberately never rendered** — they would
  bury the handful you set yourself. `Keep` is an ordinary custom tag with a reserved meaning (the
  True Bulk analyzer skips it) and a dedicated toggle on the tile; `Wishlisted` and `In Deck` are
  derived and rejected as custom tag names, or they would produce a duplicate chip nothing can
  remove.
- [client/src/lib/rapidEntry.js](client/src/lib/rapidEntry.js) — the keyboard grammar behind
  [RapidEntryDialog](client/src/components/RapidEntryDialog.jsx): `3` normal, `3+` foil, `3p` promo,
  `10x3` three copies, `-3` remove, modifiers in any order. Three things it has to get right:
  **Origins numbers its runes plainly** (Fury Rune is `OGN-007`) while SFD/UNL/VEN use `R01`, so
  `r1` resolves everywhere but OGN and `7` under OGN is a legitimate rune; **promos have no single
  id shape** (108 use `-P`, the rest use a trailing letter, `-P2`, `/298` or nothing), so
  `buildPromoIndex` groups printings under their numeric base rather than pattern-matching, and the
  **12 numbers carrying more than one promo** are broken by preferring the plain `-P`; and a typed
  finish is **rerouted to the one the card actually has** (811 printings are foil-only) because
  `CardTile` hides the stepper for a missing finish, so the copies would be invisible and
  uneditable. The dialog buffers the whole session and calls `mergeCollection` **once** on commit —
  writing per keystroke would rebuild `ownedIndex` and the collection page's filter pass for every
  card called out.
- [client/src/lib/importExport.js](client/src/lib/importExport.js) — hand-rolled CSV parser plus
  `parseImport`, which auto-detects DotGG / Legacy / TCGplayer CSV. TCGplayer rows match by
  set-code + zero-padded collector number first, then fall back to normalized name; unmatched rows
  are returned for display rather than dropped. Every row's finish goes through `routeFinish`,
  which reroutes to the finish the printing actually has (811 are foil-only, 54 normal-only) for
  the same reason rapid entry does — `CardTile` hides the stepper for a missing finish, so the
  copies would be invisible and uneditable. The **2 printings flagged for neither finish** keep
  what the file said, and `converted` reports every reroute to the dialog, the same
  never-silently-change rule `unmatched` follows. The Python converter has no card data, so it
  cannot do this — a file it produces still gets routed when imported.
- [client/src/components/CardDetailModal.jsx](client/src/components/CardDetailModal.jsx) — the
  full-card popup, opened from the ⤢ button on every deck panel row and from the card art on every
  collection tile. Deliberately **read-only**: it is a reference view, so nothing in it edits the
  deck or the collection. Both call sites hold the card **id** rather than the card, so an open
  popup follows a price refresh instead of showing a snapshot. On the tile the art is a `<button>`
  and the star and lock stay **outside** it — nesting them would be invalid HTML and would open the
  popup on every wishlist click. Its owned line folds across printings, unlike the tile behind it.
- Pages under [client/src/pages/](client/src/pages/) hold their own UI state and filtering;
  [client/src/styles.css](client/src/styles.css) is one global stylesheet (no CSS modules, no
  component library). The deck panel's group/sort controls are session-only page state, and the
  sort keeps cards with no value for the chosen key (a spell has no might) **last in both
  directions** rather than sorting them as zero.

### Printings, prices, and ownership

The 1383 rows are **printings, not cards** — 946 distinct cards, the rest promos and alternate
arts. Three helpers in `lib/cards.js` carry the distinctions, and mixing them up is the most
likely source of a subtle bug:

- **`effectivePrice(card)`** — `card.price` is the price of the *normal* printing and reads `0`
  for the **813 foil-only cards**, whose value sits in `foilPrice`. Reading `card.price` directly
  for display or sorting treats most of the set as free (this shipped as a real sorting bug).
  Use `effectivePrice`, which prefers the normal price, falls back to foil, and returns `null`
  when neither has data so "no price" never sorts as "cheapest". **The True Bulk analyzer is the
  deliberate exception** and reads `card.price` on purpose, because foils are never bulk.
- **`isBasePrinting(card)`** — plain collector number, not promo, not `Showcase` rarity. Two traps:
  **runes number as `SFD-R01`**, so a digits-only regex silently deletes 18 of the 24 runes and
  makes every deck unbuildable, and some plain-numbered cards are themselves alternate-art reprints
  in a later set (`SFD-227` reprints `OGN-119`), which is why rarity is checked too.
- **`dedupeByIdentity(cards)`** — `isBasePrinting` alone is not enough for the builder pool: each
  of the 6 runes is reprinted as a *base* printing in all four sets (Calm Rune is OGN-042, SFD-R02,
  UNL-R02 and VEN-R02), so the pool showed 24 runes. This keeps the earliest printing by
  `SET_RELEASE_ORDER`, taking the pool from 942 to 924. Runes are the **only** duplicated names
  among the base printings, so it is a no-op for everything else. Deck import resolves names
  through the same helper, so `6 Calm Rune` always lands on the same id. The **collection manager
  must not use it** — it tracks each printing separately on purpose.
- **`cardIdentity(card)` / `ownedAcrossPrintings(card, ownedIndex)`** — every deck-side ownership
  read folds all printings together, so an alt-art copy counts toward the base card a deck lists.
  Identity is the name with any parenthetical stripped, then `normName`d — promos rename
  `Darius - Hand of Noxus` to `Darius, Hand of Noxus`, and dropping punctuation collapses both.
  The **collection manager deliberately does not fold** and tracks each printing separately,
  because that is what you physically own. The **Surplus page folds** — an alt-art fourth copy is
  still a fourth copy — and drills back into `collection[printingId]` to show which physical copies
  the excess is.
- **`playsetTarget(card)` vs `deckCopyLimit(card)`** — two different questions, not
  interchangeable. `playsetTarget` (in `lib/cards.js`) is *set completion*: 3, but 1 for Legends and
  Battlefields and **0 for Runes**, which excludes them from completion stats and is load-bearing
  for `toggleWishlist`'s `Math.max(1, target - have)`. `deckCopyLimit` (in `lib/deck.js`, so it can
  read `ZONES`) is the *deck maximum* the Surplus page measures against: 3, **12 for Runes**, 1 for
  Legends and Battlefields, `Infinity` for tokens. Using `playsetTarget` for surplus would report
  every owned rune as excess.

Keywords (`[Reaction]`, `[Deflect]`, …) are **not a field** — they are parsed out of `effect` with
the numeric suffix stripped so `[Shield 2]` matches "Shield". 33 exist. `[NO TEXT]` is a
placeholder and is excluded.

### Deck legality

Enforced in the builder pool ([DeckBuilderPage](client/src/pages/DeckBuilderPage.jsx)) *and*
re-checked by `deckValidation(deck, cardsById)` in [lib/deck.js](client/src/lib/deck.js), because
filtering only prevents *adding* an illegal card — importing a deck or swapping the legend can
strand one that was legal when added.

- **Domains** (`withinLegendDomains`) — every card must sit inside the legend's two domains.
  Colorless cards and **battlefields are exempt** (all 64 are colorless anyway), and **legends are
  exempt** so the legend can still be swapped. Multi-domain cards need *all* their domains inside
  the identity. No published source states that subset rule outright, so it was validated against
  the cached riftdecks data: 3125 played cards across 69 legends, zero off-domain, including 40
  multi-domain cards.
- **Signatures** (`signatureAllowed`) — a signature card is legal only alongside its own
  champion's legend. Match on **`championOf(legend)`, the legend's name prefix — not on any shared
  tag**, because legends also carry region tags (`Yordle`) that signature cards can share, which
  would cross-match different champions.
- **Signature cap** — `MAX_SIGNATURE_CARDS` (3) counted *cumulatively across different signature
  names*, not 3 of each. `addCard` blocks the fourth. Only Master Yi and Ornn currently have more
  than one signature card, so a cap test using anyone else passes for the wrong reason (the
  3-copies-per-name limit).
- **Banned** — 13 cards, several formerly meta staples. Checked **independently of the legend**
  (an earlier version nested it under the legend branch and silently skipped it when no legend was
  chosen).
- **Chosen Champion** (`championMatchesLegend`) — must be the legend's own champion, matched on the
  champion unit's tag (`Ahri`) against `championOf(legend)`. `isChampionUnit` requires
  `type === 'Unit'`, which is load-bearing: **13 legends also carry `supertype: 'Champion'`** and
  would otherwise qualify to fill the slot. Verified against the card data — all 49 pool legends
  have at least one matching champion that also survives the domain filter. A champion stranded by
  a legend swap or an import is **flagged, never auto-cleared**.
- **Deck size** — the Chosen Champion is one of the 40, so the main zone holds 39 alongside it.
  `mainTarget(deck)` and `mainWithChampion(deck)` own that arithmetic; nothing should compare
  `zoneCount(deck.main)` against 40 directly. The champion stays in its own field, so the deck file
  shape is unchanged.

### True Bulk rules

The core business logic lives in [client/src/pages/BulkAnalyzerPage.jsx](client/src/pages/BulkAnalyzerPage.jsx),
not the server. A card is true bulk when **all** hold:

- rarity is Common or Uncommon, and it is not a Rune or token (`isToken`);
- it is not tagged `Keep`; the skipped count is reported so the exclusion is never silent;
- you own at least 1 **normal** copy — foils never count, foil-only ownership is ignored;
- normal price < the price threshold (defaults to `DEFAULT_PRICE_LIMIT`, $0.25); cards with null/0
  price are excluded as unknown, not assumed cheap;
- max play rate across meta legends ≤ the play-rate threshold (defaults to
  `DEFAULT_PLAY_RATE_LIMIT`, 10%). Anything above lands in the "protected by meta" list instead.

Both thresholds are editable inputs, session-only — they reset to the defaults on reload. The
values used are **captured into `result`** and the surrounding prose reads them from there, so
editing an input after a run cannot leave the text describing a table it does not match.

"Meta legend" = displayed `sharePct > 0` on the legends page, so a legend rounded to 0% is
excluded even with many decks. Meta maps are always requested with `date_range=all&relevance=3`.
Riftdecks card names/ids don't cleanly match the DotGG ids, so usage is recorded under three keys
— exact id, variant-stripped id (`OGN-039a` → `OGN-039`), and `n:<normName>` — and lookup takes the
highest play rate among whichever keys hit.

`metagame_id`: 1=Origins, 2=Spiritforged, 3=Unleashed, 4=Vendetta (also enterable as a custom id).
Set codes: Origins=OGN, Origins Starter / Proving Grounds=OGS, Spiritforged=SFD, Unleashed=UNL,
Vendetta=VEN, Arcane Box Set=ARC.

### Surplus rules

[client/src/pages/SurplusPage.jsx](client/src/pages/SurplusPage.jsx) lists what you own above
`deckCopyLimit` — copies no single deck could ever use. It is built from the **collection**, not
from `cards`: surplus only exists for what you own, so the loop is over the owned ids.

- Copies fold across printings by `cardIdentity`, and the row's display printing is
  `dedupeByIdentity(printings)[0]` — reusing the same "earliest set wins" rule the deck importer
  uses. Foils count toward the limit like normals.
- **Surplus value assumes you keep the most valuable copies**: the group's copies are expanded per
  unit (normal at `price`, foil at `foilPrice`, the `collectionValue` formula), sorted, and
  everything past `limit` is the surplus. Valuing `surplus × effectivePrice` instead badly misprices
  a stack that is mostly foil.
- Tokens, `Keep`-tagged cards, and collection ids missing from the card database are excluded, each
  with a reported count — the same never-silently-drop rule the True Bulk analyzer follows. A folded
  row counts as `Keep`-tagged when **any** of its printings carries the tag, since tags key on the
  printing id.

## Notes

- Card images are hot-linked from the DotGG CDN via `card.image` and nothing is bundled.
  [icons/](icons/) holds reference assets from the design phase that are **not** currently
  referenced by any code. There is no `client/public/`.
- Deliberately out of scope (previously decided against): binders, product/sealed tracking, card
  scanning, playtesting and opening-hand tools.
- The DotGG API exposes no **power** stat — its `cost` is the *energy* (generic) cost, and there
  is no separate colored-cost field. `card.power` is merged in by `state.jsx` from **two** sources,
  baseline first: the committed [client/src/data/powerCosts.json](client/src/data/powerCosts.json),
  then the runtime overlay `data/power.json`. The baseline wins, so an import can never rewrite a
  known value. Power is **null** for cards with no power concept — `hasPowerConcept` in
  [server/power.js](server/power.js) requires a non-null `cost` and not a token, which excludes
  Legends, Battlefields, Runes, and the 16 double-faced tokens that carry `cost: 0` but no power.
  Values fold across printings by `cardIdentity`, so alt-art and promo printings inherit their base
  card's power. An energy → power → default sort chain is now possible (`card.cost` then
  `card.power`).
  - Source is the keyless `api.riftcodex.com/cards`, whose `attributes.energy` is identical to
    DotGG `cost` (verified across every shared card), so **only `power` is taken from it**. It has
    no price data at all and cannot replace DotGG. Riot's own `riftbound-content-v1` carries the
    same stat but is gated to approved production keys.
  - The fetch and the join live in [server/power.js](server/power.js) and are **shared** by both
    writers, so they cannot drift: [scripts/build-power-costs.mjs](scripts/build-power-costs.mjs)
    (`node scripts/build-power-costs.mjs`, run when a new set drops) writes the committed baseline,
    and `POST /api/power/import` behind the Config page's **Import Power** button fills whatever the
    baseline is missing into `data/power.json`. The button posts only the ids that currently read
    null, so a known value is never refetched.
  - The baseline is tracked in git because the client `import`s it at build time — unlike
    everything under `data/`, nothing regenerates it on demand, so a fresh clone would fail to
    build without it.
  - `GET /api/power` is fetched with a `.catch` fallback in `state.jsx`: an Express process started
    before these routes existed 404s, and the app must still boot. **Restart Express** after
    pulling this — node does not hot-reload.
- `npm run build` is the cheapest check that nothing is broken, since there is no test suite —
  it catches bad imports and syntax that Vite's hot reload will happily paper over.

## TODO:

### **POWER INTEGRATION**
Note to Agent: tell me if the png format is slow/clunky for this purpose

<u>Icon rules (replace the colored diamonds and other symbols):</u>

1. In text icons \[rb_rune_\{domain\}\] use the domain symbol ending in 2 (i.e. icons\Chaos2.png)
2. For generic power \[rb_rune_rainbow\] and multi domain power use the rainbow symbol icons\RainbowRune.png.
3. \[rb_exhaust\] should be represented by icons\Tap.png

**Preview Card**
- Power is added as a number next to energy and before might
- If power cost is specified

**Deckbuilder**
- Power filter added
- Currently, each card has a diamond icon to show it's domains in line with the count. Change this to show the power cost using the icons in icons folder. Specifically the domain icons that end with "2" in the file name For example, "Rebuke" OGN-172 should show two chaos symbols at icons\Chaos2.png. For cards that have multiple domains, use the rainbow symbol icons\RainbowRune.png. 
- Filter UI is currently cluttered. 
  - Update to match example\deckbuilder_filterui.png. 
  - Note that domain filter should match the selected legend. The domain icon should be the same as used for power cost.
  - When a legend is not selected, the UI should match example\deckbuilder_filterui_nolegend.png
  - Don't implement bookmarks, instead replace that toggle with the owned cards toggle.

**Collection**
- Add power filter
- Supertype should be a separate filter from type. 
- Add Double-sided filter option from dot.gg\
- Replace the letter + color circle currently used for domain filter with the png icons without the 2 suffix. i.e. icons\Chaos.png. No need to algorithmically do this, hard code the pointer.
- Lock the filter/search bar so that when the user scrolls it stays at the top

**Surplus**
- Fix text alignment for the "Hide Keep -tagged". Should say "Hide Keeps"