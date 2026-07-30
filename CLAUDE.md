# CLAUDE.md

This file gives guidance to Claude Code (claude.ai/code) for work in this repository.

Always use ASD-STE100 English in responses and documentation.

## Area docs — read one before you edit

This file holds only the always-true core. The rules for each area are in `docs/`, and they load
only when you read them. **Before you edit a file in an area below, read that area's doc first.** The
doc has the rules that the code does not show; without it you will break an invariant that the tests
cannot catch (there are no tests).

| Area | Trigger files | Doc |
| --- | --- | --- |
| Libraries | `client/src/lib/*` | [docs/libraries.md](docs/libraries.md) |
| Deck builder | `client/src/pages/DeckBuilderPage.jsx`, `client/src/components/DeckFilterModal.jsx`, legality in `client/src/lib/deck.js` | [docs/deck-builder.md](docs/deck-builder.md) |
| True Bulk analyzer | `client/src/pages/BulkAnalyzerPage.jsx` | [docs/bulk-analyzer.md](docs/bulk-analyzer.md) |
| Staples analyzer | `client/src/pages/StaplesAnalyzerPage.jsx` | [docs/staples-analyzer.md](docs/staples-analyzer.md) |
| Surplus | `client/src/pages/SurplusPage.jsx` | [docs/surplus.md](docs/surplus.md) |
| Power costs | `server/power.js`, `client/src/data/powerCosts.json`, the Import Power flow | [docs/power-costs.md](docs/power-costs.md) |
| Components and page shell | `client/src/components/*`, `client/src/pages/*` UI, `client/src/styles.css`, the domain-art assets | [docs/components.md](docs/components.md) |

### When you add a page or an area

A new page or a new area gets its own `docs/<area>.md`. Put the page-specific rules there, then add
one row to the table above with the trigger files. **Keep this file the always-true core and the
map** — do not paste the page rules back into it, or you undo the token saving that the split gives.

## Commands

```bash
npm install
npm run dev      # Express on :5175 and Vite on :5173. Open :5173.
npm run build    # Vite build into dist/
npm start        # Express only on :5175. It also serves dist/ if dist/ exists.
```

On Windows, `run-riftbound.bat` does the one-server mode (`npm start`) and opens the
browser. It builds first if `dist/` is not there. It is a convenience wrapper only, and
no build step or route depends on it.

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
  `wishlist.json` and `tags.json` are the same `{cards, updatedAt}` shape behind the same `GET` and
  `PUT {cards}` pair, thus one `cardStore(route, file)` call registers each. To add a fourth store,
  add one more `cardStore()` line.

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

### Printings, prices and ownership

The 1383 rows are **printings, and not cards**. There are 946 different cards, and the other rows
are promos and alternative art. These helpers in `lib/cards.js` keep the differences correct, and
every page depends on them, thus they stay in this core file.

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

## Notes

- These items are out of scope after a decision: binders, product and sealed tracking, card
  scanning, playtest tools and opening-hand tools.

## TODO

Nothing is outstanding. Do not open these two decisions again:

- The app has **no bookmarks**. The owned-only toggle uses that space in the mockup.
- The deck builder keeps the Legal-only toggle **and** the Banned-only toggle. The select that they
  replaced was the only control that showed the 13 banned cards.
