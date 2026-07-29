# Staples rules

Read this before you edit [StaplesAnalyzerPage](../client/src/pages/StaplesAnalyzerPage.jsx). See
also [CLAUDE.md](../CLAUDE.md) for the always-true core, and
[docs/bulk-analyzer.md](bulk-analyzer.md), because the two pages read the **same meta cache** and
must stay in agreement about it.

The page answers the opposite question to the True Bulk analyzer: which cards does the meta play in
almost every list. The business logic is in the page, and not in the server.

## The two modes

The page asks one of two questions, and `MODES` holds the difference between them:

- **Deck based** (`deck`, the default) — which card does one meta deck play in almost every list.
  The measure is the play rate of a legend, thus the default limit is 50%.
- **Overall** (`overall`) — which card does the format play. The measure is the *popularity* on
  riftdecks.com/staples, which is a share **of the most played card** and not a share of the lists,
  thus the same 50% would answer a different question. **The default limit is 10%.**

The two measures are not comparable. Do not give them one default, and do not put the two numbers
into one column.

A mode carries its own default limit, and the switch writes that default into the input, thus the
50 of a Deck-based run cannot stay behind and empty an Overall list.

`result.mode` holds the mode of the **run**, and every label, every text and the CSV read it from
there (`resultMode`), and not from the control. Thus a user who moves the select after a run cannot
make the table say something the numbers do not.

Overall mode has no legend split, thus it gives each row one pseudo-deck, `OVERALL_LEGEND`. The
shape is the shape of a meta-map entry, and the pool loop, the two lists, the sort and the popup
never ask which mode made a row. Where the whole-format list carries no value (metashare, deck
count, win rate) the page **removes the column** rather than showing a dash on every row, and it
hides the "Decks above limit" sort, which would find one deck on each row.

## The rule

A card is a staple when its rate is **more than** the limit in a minimum of **one** scanned deck.
The limit is strictly greater, thus a card at exactly the limit is not a staple. The user can change
the limit, but a reload and a mode switch give the default of the mode again. The page puts the
value into `result`, and the text reads it from `result`, thus a change after a run cannot make the
text different from the list.

The rule reads the rate only. The price, the rarity and the ownership have no effect, thus a card
that you do not own is in the list. The detail panel shows the copies that you own, folded across
the printings (`ownedAcrossPrintings`), because the list holds one row for each card.

## The data

Deck-based mode uses `api.getMetaLegends` and `api.getMetaMap`, the same two endpoints and the same
`data/meta-cache/` files as the True Bulk analyzer. Overall mode uses `api.getStaples`
(`GET /api/meta/staples`, cached in `data/meta-cache/staples.json`), which has **no metagame id**,
because riftdecks.com ranks that list over every Constructed deck of the last 30 days. **The page
never sends `refresh`**, thus a run is local and inexpensive after the first one. The Config page is
the one place that gets fresh data, and it has one button for each of the two caches.

The page scans **every legend** on the legends page, and a `sharePct` of 0 does not exclude one: a
fringe deck that plays a card in each of its lists still shows a staple of that deck.

The riftdecks names and ids do not match the DotGG ids correctly, thus the page records the usage
under the same three keys as the bulk analyzer: the exact id, the id with no variant (`OGN-039a`
becomes `OGN-039`), and `n:<normName>`. The staples list gives **two** ids for one card, because the
collector number and the image disagree for the runes (`VEN-R02` against the `OGN-042` image), thus
Overall mode records both. **The usage map holds one entry for each legend under each key**, and not
one maximum for all the legends, because Deck-based mode must show the play rate of each deck. The
lookup merges the keys and keeps the highest rate **for each legend**, thus a card that resolves on
two keys cannot count one deck two times.

A card above the limit on riftdecks.com that no printing matches cannot reach the list. The page
counts these and gives the names under the list. **Do not remove that text.** Without it a parser
change makes staples disappear in silence.

### The staples parser

`getStaples` in [server/riftdecks.js](../server/riftdecks.js) reads the HTML grid, and not an
embedded `DATA` array: each card is a `div[data-collector_number]` with the popularity in
`.text-rainbow span` and the copies per deck in `.text-muted span`. The page is **paged**, about 45
pages of 20 cards, thus the walk stops when a page ends under `STAPLES_MIN_POPULARITY` (1%), which
is about 23 pages. Two results follow, and the page states both: a limit under 1% cannot find more
cards, and the request is polite (`STAPLES_PAGE_DELAY_MS`), because rapid requests get the
Cloudflare challenge page in place of the HTML.

## The lists

The pool is `dedupeByIdentity(cards.filter(isBasePrinting))`, thus a list holds **one row for each
card** and not one for each printing. An alt art must not give the same name three times.

The page has the same collapsible panels and the same table as the True Bulk analyzer, **with no
Remove column**: this page never changes the collection. The rows go into two lists:

- **Staples you own** — `ownedAcrossPrintings` gives a minimum of 1 copy. This list is open at the
  start, because "which staples do I hold" is the question the page exists to answer.
- **Staples you are missing** — you have no copy in any printing.

The copies are folded **across the printings**, and not read from one printing id, because a row is
a card. `price` is `effectivePrice`, thus a foil-only staple does not show as free, and `value` is
the copies multiplied by that price. A row keeps `price` from the run, but reads the copies, the
value and the lock **live**, thus a stepper on another page moves a card between the two lists at
the next render.

The one toolbar above the panels drives the two lists together (search, sets, domains, rarity,
sort). The rarity select **joins Common and Uncommon into one choice** (`LOW_RARITY`), because a
staple at those two rarities answers the same question. Its value is not a rarity name, thus it
cannot match a card by accident, and the filter must expand it to `LOW_RARITIES` before the test. The `Keep` lock is in the table for the same reason as on the bulk page: a staple is exactly
the card that must never go to the bulk box. **The lock does not move a row here**, because the
lists ask about ownership and not about the lock.

## The card popup

The thumbnail opens the **meta-deck popup**, and not the card detail popup: the list is for the
scan, and this is for the analysis. It gives the art, the copies you own against the playset target,
and one row for each deck above the limit with the metashare of the deck, the play rate, the average
copies, the deck count and the win rate. An Overall run has one row, the popularity and the average
copies only, for the reason in "The two modes". A button in it opens the usual read-only
`CardDetailModal`. **The two popups never show at one time** — the page hides the meta-deck popup
while the detail popup is open, thus one backdrop cannot sit over the other.
