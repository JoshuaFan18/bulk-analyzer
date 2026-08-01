# Libraries — `client/src/lib/`

Read this before you edit a file in `client/src/lib/`. See also [CLAUDE.md](../CLAUDE.md) for the
always-true core, and [deck-builder.md](deck-builder.md) for the deck rules that `lib/deck.js`
applies.

- [client/src/lib/cards.js](../client/src/lib/cards.js) has the domain constants, the pure helpers
  (`SET_CODE_BY_NAME`, `normName`, `playsetTarget`, `setRank`, `setNameOptions`, `routeFinish`) and
  the predicates in the sections that follow. Each filter bucket list has a `*Bucket` helper and a
  matcher (`ENERGY_BUCKETS`/`energyBucket`/`matchesCost`, `MIGHT_BUCKETS`/`mightBucket`/
  `matchesMight`, `POWER_BUCKETS`/`powerBucket`/`matchesPower`), because the collection page, the
  deck filter modal, the builder's per-option counts and the deck stats curve all read them. **Keep
  each list with its bucket helper and its matcher**, or a count appears next to an option that
  filters to something else. A `*Bucket` helper gives **null** for a null stat, thus the matchers
  reject it and do not read null as 0. Put all other reusable non-visual code here or in
  `lib/deck.js`.
- [client/src/lib/deck.js](../client/src/lib/deck.js) has the deck model, the rules and the plain-text
  deck format (a bare `Section:` header, then `3 Card Name`). A deck is
  `{ legend, champion, battlefields, runes, main, side, bench }`, and each zone field is a
  `{cardId: count}` map. `ZONES` has the limits, and `addCard` obeys them: at a limit it returns the
  deck with no change and no message. Use `deckEntries()` to read a deck. `moveCard()` moves one
  copy along `ZONE_LADDER` (`bench` to `side` to `main`) and **removes the copy before it adds the
  copy**, thus the limit check at the destination does not count that copy. A blocked move must not
  delete the copy. Battlefields and Runes have no arrows. Use `canMoveCard` to disable the button.
- [client/src/lib/cardText.js](../client/src/lib/cardText.js) has `parseCardText`, which changes one
  `effect` string into blocks of parts for [CardText](../client/src/components/CardText.jsx). The icon
  codes are `rb_might`, `rb_exhaust`, `rb_energy_<n>`, `rb_rune_<domain>` and `rb_rune_rainbow`.
  `[&gt;]` and `[&gt;&gt;]` are **arrows** and not keywords. Reminder text in `<em>` also has icon
  codes, thus an `em` part contains parsed parts and not a string.
- [client/src/lib/tags.js](../client/src/lib/tags.js) keeps the tags in `data/tags.json` per **printing
  id**, as the collection does. The custom tags and the derived `Wishlisted` and `In Deck` show as
  chips. The 128 DotGG API tags (regions, creature types, champion names) filter, but they must stay
  **invisible**, or they hide the tags that the user sets. `Wishlisted` and `In Deck` are refused as
  custom names. `Keep` is a custom tag with a special function: the True Bulk analyzer and the
  Surplus page ignore these cards.
- [client/src/lib/rapidEntry.js](../client/src/lib/rapidEntry.js) has the keyboard grammar for
  [RapidEntryDialog](../client/src/components/RapidEntryDialog.jsx): `3` is normal, `3+` is foil, `3p`
  is promo, `3a`/`3b` are the alternative-art printings (`SET-003a`; the runes fold in, so `r01a` is
  `SET-R01a`), `3*` is the signature printing (the `-STAR` overnumber, `SET-227-STAR`), `10x3` is
  three copies, `-3` removes, and the modifiers can be in any sequence. Sets disagree on the case of
  the `a`/`b` suffix (`OGN-066a` but `VEN-021A`), thus the resolver tries the typed case, then the
  other. The alt-art and signature printings are all foil-only, thus `routeFinish` sends them to
  foil and the row shows the auto-swap.
  **Origins gives its runes usual numbers** (Fury Rune is `OGN-007`), but SFD, UNL and VEN use
  `R01`. Promos have many id formats, thus `buildPromoIndex` groups the printings by their numeric
  base and prefers the plain `-P`. The dialog calls `mergeCollection` **one time** at the commit.
  The dialog's Trade screen uses the **same** `resolveRapidEntry`, but it types the set code in the
  token and negates the away box — see [components.md](components.md).
- [client/src/lib/importExport.js](../client/src/lib/importExport.js) has a CSV parser and
  `parseImport`, which identifies a DotGG, Legacy or TCGplayer file. A TCGplayer row matches first
  on the set code with the collector number, then on the name. **Never change or delete a row
  without a message:** the dialog gets `unmatched` and `converted`.
- `routeFinish` in `lib/cards.js` **changes a typed finish to the finish that the printing has**,
  and the importer and rapid entry both call it. Most printings are foil-only, and `CardTile` hides
  the stepper for a missing finish. Thus the copies become invisible and the user cannot change them.
- [client/src/lib/icons.js](../client/src/lib/icons.js) has the domain art in hard-coded maps:
  `DOMAIN_ICON` (plain art, the collection filter chips), `DOMAIN_POWER_ICON` (the art with the `2`
  suffix, the power costs and the runes in rules text), `RAINBOW_ICON` and `TAP_ICON`. **Write each
  pointer**, because an ES import cannot use a runtime string. Use `DomainIcon` (an unknown domain
  shows the rainbow rune) and `PowerCost` (one symbol for each point of power, and nothing at power
  0 or null). Do not read the maps.
