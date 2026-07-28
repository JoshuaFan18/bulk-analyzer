# CLAUDE.md

This file gives guidance to Claude Code (claude.ai/code) for work in this repository.

## Commands

```bash
npm install
npm run dev      # Express on :5175 and Vite on :5173. Open :5173.
npm run build    # Vite build into dist/
npm start        # Express only on :5175. It also serves dist/ if dist/ exists.
```

There is no test suite, no linter and no formatter. Thus `npm run build` is the least expensive
check. It finds the bad imports and the bad syntax that Vite hot reload accepts.

`API_PORT` sets the server port, but the Vite proxy in [vite.config.js](vite.config.js) contains
the fixed address `http://localhost:5175`. Change the two together.

[tcg_to_riftgg/](tcg_to_riftgg/) is a separate Python program. Its logic is now also in
[client/src/lib/importExport.js](client/src/lib/importExport.js), which is the primary path. If you
change the set codes or the TCGplayer columns, change the two files together.

## Architecture

This is a local-first app for one user. The SPA is React (Vite) in [client/](client/), and the API
is Express in [server/](server/). **All data is JSON files in `data/`** (not in git). There is no
database and there are no accounts. The server owns the files and gets the data from the two
external sources. Thus the browser has no CORS problem.

### Server

- [server/store.js](server/store.js) is the only layer that touches the filesystem. All access uses
  `readJson`, `writeJson`, `listJson` and `deleteJson`, relative to `data/`. A write goes to a
  temporary file, then the code renames it. A file that is not there gives the fallback, thus the
  app starts correctly with an empty `data/`.
- [server/cards.js](server/cards.js) gets the DotGG indexed API and changes its column-index format
  into card objects. The result stays in `data/cards.json` until the user pushes "Update prices"
  (`POST /api/prices/refresh`). Prices and card data refresh together.
  - The endpoint always sends all 1383 rows and ignores the query parameters. Thus all filters are
    in the client, and a new filter has no cost at the API.
  - The mapper keeps only some of the 37 API fields. To add a field: add it here, **restart the
    Express process** (node does not hot-reload), then send `POST /api/prices/refresh`. Without the
    last two steps the field stays `undefined` and the new filter finds nothing.
- [server/riftdecks.js](server/riftdecks.js) reads the HTML of riftdecks.com with cheerio and
  regular expressions, and caches the results in `data/meta-cache/` (`?refresh=1` ignores the
  cache). **These parsers are the weakest part of the code.** They fail when the site markup
  changes.
- [server/index.js](server/index.js) has routes only, and no business logic. The `handle()` wrapper
  changes an error into a 500 `{error}`, and the client shows that text. `collection.json`,
  `wishlist.json` and `tags.json` use the same `GET` and `PUT {cards}` pair. To add a fourth store,
  copy that pair.

### Client

[client/src/state.jsx](client/src/state.jsx) has one `AppProvider` context with the cards, the
collection, the wishlist, the tags and the decks. It loads all five in parallel at mount. Mutations
are optimistic, and a save occurs **600 ms after the last change**. `setState` updaters are
asynchronous, thus a `next*Ref` keeps the newest data. **Each store with more than one mutator needs
its own ref**, or two mutations in one debounce window send the older data.

`state.jsx` also makes three indexes one time and sends them through the context. Do not calculate
them again in a filter pass: `ownedIndex` folds the owned copies across the printings,
`keywordIndex` gets the keywords from the effect text, and `inDeckIndex` maps a cardId to the deck
names.

Data shapes:

- The collection is `{ [cardId]: { normal, foil } }`. `setQty` and `mergeCollection` delete an entry
  at 0/0, thus all code that reads the collection must accept missing keys. `mergeCollection`
  receives **signed** deltas and stops at 0.
- The wishlist is `{ [cardId]: count }`, but old entries contain the value `true`. **Read it with
  `wishlistQty`**, which gives 1 for `true`. Do not migrate the file. A star adds the quantity that
  the playset does not have, with a minimum of 1, because `playsetTarget` gives 0 for a Rune.
- The decks are in the context because the collection page shows `[In Deck]`. **Call `reloadDecks()`
  after each deck save and each deck delete.**

Libraries:

- [client/src/lib/cards.js](client/src/lib/cards.js) has the domain constants, the pure helpers
  (`SET_CODE_BY_NAME`, `normName`, `playsetTarget`, `collectionValue`) and the predicates in the
  sections that follow. The filter buckets and their matchers (`MIGHT_BUCKETS`/`matchesMight`,
  `POWER_BUCKETS`/`matchesPower`, `matchesType`, `matchesSupertype`) are here because two pages use
  them. Keep each list with its matcher. The two stat matchers must reject a **null** stat, and must
  not read null as 0. Put all other reusable non-visual code here or in `lib/deck.js`.
- [client/src/lib/deck.js](client/src/lib/deck.js) has the deck model, the rules and the plain-text
  deck format (a bare `Section:` header, then `3 Card Name`). A deck is
  `{ legend, champion, battlefields, runes, main, side, bench }`, and each zone field is a
  `{cardId: count}` map. `ZONES` has the limits, and `addCard` obeys them: at a limit it returns the
  deck with no change and no message. Use `deckEntries()` to read a deck. `moveCard()` moves one
  copy along `ZONE_LADDER` (`bench` to `side` to `main`) and **removes the copy before it adds the
  copy**, thus the limit check at the destination does not count that copy. A blocked move must not
  delete the copy. Battlefields and Runes have no arrows. Use `canMoveCard` to disable the button.
- [client/src/lib/cardText.js](client/src/lib/cardText.js) has `parseCardText`, which changes one
  `effect` string into blocks of parts for [CardText](client/src/components/CardText.jsx). The icon
  codes are `rb_might`, `rb_exhaust`, `rb_energy_<n>`, `rb_rune_<domain>` and `rb_rune_rainbow`.
  `[&gt;]` and `[&gt;&gt;]` are **arrows** and not keywords. Reminder text in `<em>` also has icon
  codes, thus an `em` part contains parsed parts and not a string.
- [client/src/lib/tags.js](client/src/lib/tags.js) keeps the tags in `data/tags.json` per **printing
  id**, as the collection does. The custom tags and the derived `Wishlisted` and `In Deck` show as
  chips. The 128 DotGG API tags (regions, creature types, champion names) filter, but they must stay
  **invisible**, or they hide the tags that the user sets. `Wishlisted` and `In Deck` are refused as
  custom names. `Keep` is a custom tag with a special function: the True Bulk analyzer and the
  Surplus page ignore these cards.
- [client/src/lib/rapidEntry.js](client/src/lib/rapidEntry.js) has the keyboard grammar for
  [RapidEntryDialog](client/src/components/RapidEntryDialog.jsx): `3` is normal, `3+` is foil, `3p`
  is promo, `10x3` is three copies, `-3` removes, and the modifiers can be in any sequence.
  **Origins gives its runes usual numbers** (Fury Rune is `OGN-007`), but SFD, UNL and VEN use
  `R01`. Promos have many id formats, thus `buildPromoIndex` groups the printings by their numeric
  base and prefers the plain `-P`. The dialog calls `mergeCollection` **one time** at the commit.
- [client/src/lib/importExport.js](client/src/lib/importExport.js) has a CSV parser and
  `parseImport`, which identifies a DotGG, Legacy or TCGplayer file. A TCGplayer row matches first
  on the set code with the collector number, then on the name. **Never change or delete a row
  without a message:** the dialog gets `unmatched` and `converted`.
- `routeFinish` (import) and rapid entry both **change a typed finish to the finish that the
  printing has**. Most printings are foil-only, and `CardTile` hides the stepper for a missing
  finish. Thus the copies become invisible and the user cannot change them.
- [client/src/lib/icons.js](client/src/lib/icons.js) has the domain art in hard-coded maps:
  `DOMAIN_ICON` (plain art, the collection filter chips), `DOMAIN_POWER_ICON` (the art with the `2`
  suffix, the power costs and the runes in rules text), `RAINBOW_ICON` and `TAP_ICON`. **Write each
  pointer**, because an ES import cannot use a runtime string. Use `DomainIcon` (an unknown domain
  shows the rainbow rune) and `PowerCost` (one symbol for each point of power, and nothing at power
  0 or null). Do not read the maps.

Components and pages:

- [client/src/components/CardDetailModal.jsx](client/src/components/CardDetailModal.jsx) is the
  full-card popup. It is **read-only** and must not change a deck or the collection. The two call
  sites keep the card **id** and not the card, thus an open popup shows the new price after a
  refresh. On the tile, the star and the lock stay **outside** the art button.
- [client/src/components/DeckFilterModal.jsx](client/src/components/DeckFilterModal.jsx) has the
  deck builder filters, and each option shows the quantity that it gives with all the *other*
  filters applied. `filterGroups` and `poolCounts` in
  [DeckBuilderPage](client/src/pages/DeckBuilderPage.jsx) calculate all the counts in **one pass**,
  and the counts group by `cardIdentity`. Do not calculate the pool again for each option. The
  domain row follows the legend. With no legend the modal hides TYPE, ENERGY, POWER, MIGHT and
  RARITY, but keeps their values and gives the name of each hidden filter that is active.
  `atLimitIds` is built only when the "Available to add" toggle is on **or** the modal is open, thus
  its predicate must read the toggle and not the set.
- The pages in [client/src/pages/](client/src/pages/) keep their own UI state and filters, and
  [client/src/styles.css](client/src/styles.css) is one global stylesheet. The sort on the deck
  panel puts a card with no value for the key **last in the two directions**, and not at zero.

### Printings, prices and ownership

The 1383 rows are **printings, and not cards**. There are 946 different cards, and the other rows
are promos and alternative art. These helpers in `lib/cards.js` keep the differences correct.

- **`effectivePrice(card)`** — `card.price` is the price of the *normal* printing, and it is `0` for
  the 813 foil-only cards, whose value is in `foilPrice`. Use `effectivePrice` for a display or a
  sort. It gives the normal price, then the foil price, then `null`, thus "no price" does not sort
  as "least expensive". **The True Bulk analyzer is the one exception**, because a foil is never
  bulk.
- **`isBasePrinting(card)`** — a usual collector number, not a promo, and not the `Showcase` rarity.
  The **runes have the format `SFD-R01`**, thus a digits-only regular expression deletes 18 of the
  24 runes. The helper also examines the rarity, because some cards with a usual number are
  alternative-art reprints in a later set (`SFD-227` reprints `OGN-119`).
- **`dedupeByIdentity(cards)`** — each of the 6 runes is a *base* printing in all four sets, thus
  `isBasePrinting` alone gives 24 runes in the builder pool. This helper keeps the first printing by
  `SET_RELEASE_ORDER`. The deck import uses it also, thus `6 Calm Rune` always finds the same id.
  **The collection manager must not use it**, because it keeps each printing separate.
- **`cardIdentity(card)` and `ownedAcrossPrintings(card, ownedIndex)`** — all deck-side ownership
  reads fold the printings together, thus a copy with alternative art counts for the base card. The
  identity is the name with no text in parentheses, then `normName`. The **collection manager does
  not fold**, because you own each printing. The **Surplus page folds**, then reads
  `collection[printingId]` to show the physical copies.
- **`playsetTarget(card)` and `deckCopyLimit(card)`** are two different questions. `playsetTarget`
  (in `lib/cards.js`) is for *set completion*: 3, but 1 for a Legend and a Battlefield, and **0 for
  a Rune**. `deckCopyLimit` (in `lib/deck.js`) is the *deck maximum* for the Surplus page: 3, **12
  for a Rune**, 1 for a Legend and a Battlefield, and `Infinity` for a token.

The keywords (`[Reaction]`, `[Deflect]`, …) are **not a field**. The code gets them from `effect`
and removes the number, thus `[Shield 2]` matches "Shield". There are 33 keywords. `[NO TEXT]` is a
placeholder and the code removes it.

### Deck legality

The builder pool ([DeckBuilderPage](client/src/pages/DeckBuilderPage.jsx)) applies these rules, and
`deckValidation(deck, cardsById)` in [lib/deck.js](client/src/lib/deck.js) applies them again. A
filter stops only an *addition*, but a deck import or a new legend can make an added card illegal.

- **Domains** (`withinLegendDomains`) — each card must be in the two domains of the legend, and a
  multi-domain card needs *all* of its domains. A colorless card, a **battlefield** and a **legend**
  are exempt. The legend is exempt so that the user can change it.
- **Signatures** (`signatureAllowed`) — a signature card is legal only with the legend of its
  champion. Match on **`championOf(legend)`, the name prefix of the legend**, and not on a tag,
  because the legends also have region tags that signature cards can have.
- **Signature cap** — `MAX_SIGNATURE_CARDS` is 3. Count the *total across different signature
  names*, and not 3 of each name.
- **Banned** — 13 cards. Examine this rule **independently of the legend**, or a deck with no legend
  has no ban check.
- **Chosen Champion** (`championMatchesLegend`) — match the tag of the champion unit against
  `championOf(legend)`. `isChampionUnit` must keep the condition `type === 'Unit'`, because **13
  legends also have `supertype: 'Champion'`**. If a new legend or an import makes the champion
  incorrect, the app **shows a message and does not remove the champion**.
- **Deck size** — the Chosen Champion is one of the 40 cards, thus the main zone holds 39. Use
  `mainTarget(deck)` and `mainWithChampion(deck)`, and do not compare `zoneCount(deck.main)` with
  40.

### True Bulk rules

The business logic is in
[client/src/pages/BulkAnalyzerPage.jsx](client/src/pages/BulkAnalyzerPage.jsx), and not in the
server. A card is true bulk when **all** of these conditions are true:

- The rarity is Common or Uncommon, and the card is not a Rune and not a token (`isToken`).
- The card does not have the `Keep` tag. The page reports the quantity that it removed.
- You own a minimum of 1 **normal** copy. A foil never counts.
- The normal price is less than the price limit (`DEFAULT_PRICE_LIMIT`, $0.25). A null price or a 0
  price is unknown, and the page removes that card. Do not think that it is inexpensive.
- The maximum play rate across the meta legends is less than or equal to the play-rate limit
  (`DEFAULT_PLAY_RATE_LIMIT`, 10%). A card above the limit goes into the "protected by meta" list.

The user can change the two limits, but a reload gives the defaults again. The page puts the values
into `result` and the text reads them from `result`, thus a change after a run cannot make the text
different from the table.

A "meta legend" has a `sharePct` more than 0 on the legends page, thus a legend at 0% is not a meta
legend. A meta map always uses `date_range=all&relevance=3`. The riftdecks names and ids do not
match the DotGG ids correctly, thus the page records the usage under three keys: the exact id, the
id with no variant (`OGN-039a` becomes `OGN-039`), and `n:<normName>`. The lookup takes the highest
play rate of the keys that it finds.

`metagame_id`: 1 is Origins, 2 is Spiritforged, 3 is Unleashed, 4 is Vendetta. Set codes: Origins is
OGN, Origins Starter / Proving Grounds is OGS, Spiritforged is SFD, Unleashed is UNL, Vendetta is
VEN, Arcane Box Set is ARC.

### Surplus rules

[client/src/pages/SurplusPage.jsx](client/src/pages/SurplusPage.jsx) shows the copies above
`deckCopyLimit`, which no deck can use. The page reads the **collection** and not `cards`, because a
surplus exists only for the cards that you own.

- The copies fold across the printings by `cardIdentity`, and the row shows
  `dedupeByIdentity(printings)[0]`. A foil counts for the limit as a normal card does.
- **The surplus value assumes that you keep the most expensive copies.** The page gives a value to
  each copy (`collectionValue`), sorts them, and the copies after `limit` are the surplus.
  `surplus × effectivePrice` gives an incorrect value for a group with many foils.
- The page removes the tokens, the cards with the `Keep` tag, and the collection ids that are not in
  the card database, and reports a quantity for each. A folded row has the `Keep` tag when **any** of
  its printings has the tag.

## Notes

- The card images come from the DotGG CDN through `card.image`, and the app has no local copies. The
  **domain art is the exception**. [icons/](icons/) has the 1000×1000 originals, which are outside
  the Vite root and cannot be imported. `scripts/resize-icons.ps1` makes the 14 small files in
  `client/src/assets/icons/`, and all imports point there. **To add an icon, add it in the two
  directories.** [vite.config.js](vite.config.js) removes that directory from the inline rule, thus
  the browser keeps the files in its cache. There is no `client/public/`.
- These items are out of scope after a decision: binders, product and sealed tracking, card
  scanning, playtest tools and opening-hand tools.
- The DotGG API has no **power** stat, and its `cost` is the *energy* (generic) cost. `state.jsx`
  adds `card.power` from the committed baseline
  [client/src/data/powerCosts.json](client/src/data/powerCosts.json), then from the runtime overlay
  `data/power.json`. **The baseline wins**, thus an import cannot change a known value. The values
  fold across the printings by `cardIdentity`.
  - Power is **null** for a card with no power concept. `hasPowerConcept` in
    [server/power.js](server/power.js) needs a `cost` that is not null and refuses a token. Thus the
    Legends, the Battlefields, the Runes and the double-faced tokens have no power.
  - The source is the keyless `api.riftcodex.com/cards`. Take **only `power`** from it, because it
    has no prices and cannot replace DotGG.
  - The fetch and the join are in [server/power.js](server/power.js), and the two writers use this
    same code: `node scripts/build-power-costs.mjs` writes the baseline after a new set, and `POST
    /api/power/import` (the **Import Power** button on the Config page) writes the missing values
    into `data/power.json`. The button sends only the ids that are null.
  - The baseline is in git, because the client `import`s it at the build and nothing makes it again.
  - `state.jsx` gets `GET /api/power` with a `.catch` fallback, because an Express process from
    before these routes sends a 404. **Restart Express** after you pull this change.

## TODO

Nothing is outstanding. Do not open these two decisions again:

- The app has **no bookmarks**. The owned-only toggle uses that space in the mockup.
- The deck builder keeps the Legal-only toggle **and** the Banned-only toggle. The select that they
  replaced was the only control that showed the 13 banned cards.
