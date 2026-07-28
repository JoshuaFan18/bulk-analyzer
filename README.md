# Riftbound Manager

A local Riftbound TCG collection manager, true bulk analyzer, and deck builder.
React (Vite) frontend + Node/Express backend. All data is stored as JSON files
under `data/` on your disk — no accounts, nothing leaves your machine except
fetches to the public card/price API and riftdecks.com.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The first page load downloads the card
database (1,383 cards) from the DotGG API and caches it in `data/cards.json`.

For a production-style single server: `npm run build` then `npm start`
(serves everything on http://localhost:5175).

## Pages

### Collection (`/collection`)
- Card grid with normal/foil copy steppers and a stats sidebar (value estimate,
  per-set / rarity / printing / element completion).
- Filters: set, color, cost, **might**, type, rarity, **keyword**,
  **legality**, **errata**, and text search. The type filter covers both card
  types (Unit, Spell, Gear, Battlefield, Rune, Legend) and super types
  (Champion, Signature, Token, Basic). Banned cards carry a red badge.
- **Import** accepts three formats, auto-detected:
  - DotGG CSV: `CardId,Normal,Foil,Name,Set`
  - Legacy CSV: `Normal,Foil,CardId`
  - TCGplayer collection export (the format in `tcg_to_riftgg/example/input.csv`)
- **Export** produces DotGG CSV accepted by riftbound.gg.
- **Update TCGplayer prices** re-fetches prices only when you press it. The
  "prices as of" timestamp shows the last refresh.

### True Bulk Analyzer (`/bulk-analyzer`)
True bulk = a common/uncommon whose **normal** TCGplayer price is under $0.25
**and** that is not played in more than 10% of decks for any meta legend.
- Meta legends = legends whose displayed metashare is above 0% on
  `riftdecks.com/legends?metagame_id=<x>` (Origins=1, Spiritforged=2,
  Unleashed=3, Vendetta=4 — pick a preset or type a custom id).
- Per-legend usage comes from each legend's meta-map page with
  `date_range=all&relevance=3`.
- Only normal copies you own are counted — foils are never bulk. Runes and
  tokens are excluded entirely.
- Results show the bulk list (exportable as CSV) plus a "cheap but protected
  by meta" list. Scrapes are cached in `data/meta-cache/` — tick the re-fetch
  box to force fresh data.

### Deck Builder (`/deckbuilder`)
Legend (1) / Chosen Champion (1) / Battlefields (3) / Runes (12) / Main Deck
(40, max 3 copies) / Sideboard (0-10) / The Bench (planning area). Click a
pool card to add, right-click to remove. Pool tiles show how many copies you
own. The panel has Deck / Stats / Collection tabs — Collection shows owned vs
needed for every deck card. Decks import/export as plain text.

The pool lists **base printings only** — 942 of the 1,383 cards. Promos
(`-P`), alternate arts (`OGN-039a`, `UNL-024A`), and the `-STAR` / `-SP`
variants are hidden so each card appears once. Runes keep one base printing
per set (`SFD-R01`), giving 24 across the four sets. The collection manager
still shows every printing — this filter applies only to the builder.

**Ownership folds across printings.** Every deck view counts all printings of
a card toward the base printing, so an alt-art or promo copy you own counts
normally. The collection manager still tracks each printing separately.

**The legend enforces deck legality.** Selecting a legend narrows the pool to
what is actually playable — roughly 942 → 372 cards:

- **Domains.** Every card must sit inside the legend's two domains. Colorless
  cards and battlefields are always legal, and all 49 legends stay visible so
  you can still swap legends. Runes narrow to the legend's two colors (8 of 24).
- **Signature cards.** Only your legend's champion's signatures remain, matched
  on the legend's champion name rather than any shared tag, because legends
  also carry region tags such as `Yordle`.
- **Signature cap.** At most 3 signature cards total, counted across different
  signature names rather than 3 of each. The panel shows a `3/3` counter and
  blocks the fourth.

Cards already in a deck are re-checked, so importing a deck or swapping the
legend flags off-domain cards, other champions' signatures, and an over-cap
signature count instead of leaving the deck silently illegal.

**Banned cards** are flagged with a red badge and reported by the deck panel
whether or not a legend is selected — 13 cards are currently banned, several of
which were meta staples (The Dreaming Tree, Reaver's Row).

**Owned only** filters the pool to cards you have, counting all printings.

Builder filters also include might, super type, keyword, legality, and errata.
Keywords are parsed out of the effect text rather than read from a field — the
API has no keyword column — giving 33 of them ([Reaction], [Deflect], [Equip],
[Hidden], …) with the numeric suffix of things like `[Shield 2]` stripped.

### Deck Viewer (`/decks/view/<id>`)
Card-image layout of a saved deck with price, curve, and domain stats. The
**Collection** tab lists owned vs missing copies, lets you tag any missing
card as **wishlisted** (or wishlist all missing), and shows the estimated
cost to complete. Wishlisted cards appear in the collection manager under
"Show: Wishlisted".

## Data files

| File | Contents |
| --- | --- |
| `data/cards.json` | Card database + prices (refreshed via the button) |
| `data/collection.json` | Your collection counts |
| `data/wishlist.json` | Wishlisted card ids |
| `data/decks/*.json` | Saved decks |
| `data/meta-cache/*.json` | Cached riftdecks.com scrapes |
