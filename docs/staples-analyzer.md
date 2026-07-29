# Staples rules

Read this before you edit [StaplesAnalyzerPage](../client/src/pages/StaplesAnalyzerPage.jsx). See
also [CLAUDE.md](../CLAUDE.md) for the always-true core, and
[docs/bulk-analyzer.md](bulk-analyzer.md), because the two pages read the **same meta cache** and
must stay in agreement about it.

The page answers the opposite question to the True Bulk analyzer: which cards does the meta play in
almost every list. The business logic is in the page, and not in the server.

## The three modes

The page asks one of three questions, and `MODES` holds the difference between them as two flags,
`deckSide` and `fieldSide`, which say which source the mode reads. **Ask the flags, and not the mode
name**, or Overlap falls out of a test that a later mode must also pass:

- **Deck based** (`deck`, the default) — which card does one meta deck play in almost every list.
  The measure is the play rate of a legend, thus its limit (`DEFAULT_DECK_LIMIT`) is 50%.
- **Field** (`field`) — which card does the format play. The measure is the *popularity* on
  riftdecks.com/staples, which is a share **of the most played card** and not a share of the lists,
  thus the same 50% would answer a different question. **Its limit (`DEFAULT_FIELD_LIMIT`) is 10%.**
- **Overlap** (`overlap`) — reads the two sources and joins the two tests with the operator in the
  Join select: **AND** (the default, the narrow question: a staple of a deck that the whole field
  also plays) or **OR** (the wide question: a staple of either measure).

The two measures are not comparable. They keep **two inputs**, two labels and two columns, and they
are never given one limit. Overlap shows the two inputs and the operator between them; each other
mode shows its own one.

A mode switch writes the two defaults into the two inputs, thus the 50 of a Deck-based run cannot
stay behind and empty the popularity test of the next run.

`result.mode`, `result.combine` and `result.limits` hold the values of the **run**, and every label,
every text and the CSV read them from there (`resultMode`, `resultSides`, `ruleText`), and not from
the controls. Thus a user who moves a control after a run cannot make the table say something the
numbers do not.

The field source has no legend split, thus it gives each of its hits one pseudo-deck, `FIELD_LEGEND`.
The shape is the shape of a meta-map entry, and the pool loop, the two lists, the sort and the popup
never ask which source made a row. Where the whole-format list carries no value (metashare, deck
count, win rate) a **Field** run **removes the column** rather than showing a dash on every row, and
it hides the "Decks above limit" sort, which would find one deck on each row. An **Overlap** run
keeps those columns, because its rows also hold real meta decks, and the field row shows a dash in
them.

Each rate has its own sort (`playRate`, `popularity`), and a run offers only the sorts of the
sources it read. A sort that the new mode does not offer is moved to one it does before the result
is set, or the select would show a value that no option holds. A missing rate sorts as `-1`
(`rateOf`), thus an OR row that one side alone found goes to the end of the list and not to the top.

## The rule

A card is a staple when its rate is **more than** the limit in a minimum of **one** scanned deck (in
Overlap, on each side that the operator needs). The limit is strictly greater, thus a card at exactly
the limit is not a staple. The user can change the limit, but a reload and a mode switch give the
defaults again. The page puts the values into `result.limits`, and the text reads them from there,
thus a change after a run cannot make the text different from the list.

The rule reads the rate only. The price, the rarity and the ownership have no effect, thus a card
that you do not own is in the list. The detail panel shows the copies that you own, folded across
the printings (`ownedAcrossPrintings`), because the list holds one row for each card.

## The data

The deck side uses `api.getMetaLegends` and `api.getMetaMap`, the same two endpoints and the same
`data/meta-cache/` files as the True Bulk analyzer. The field side uses `api.getStaples`
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
the field side records both. **The usage map holds one entry for each legend under each key**, and
not one maximum for all the legends, because the deck side must show the play rate of each deck. The
lookup (`hitsFor`) merges the keys and keeps the highest rate **for each legend**, thus a card that
resolves on two keys cannot count one deck two times.

The two sources go into **two maps** (`deckUsage`, `fieldUsage`), and never into one, because Overlap
must test the two of them separately: one map would compare a play rate against a popularity.

A card above the limit on riftdecks.com that no printing matches cannot reach the list. The page
counts these and gives the names under the list, each source against its own limit. **Do not remove
that text.** Without it a parser change makes staples disappear in silence.

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
cannot match a card by accident, and the filter must expand it to `LOW_RARITIES` before the test.

The CSV holds the columns of the sources the run read, thus an Overlap file has the two rates, and
its name says the operator (`staples-overlap-and-1.csv`) because the two operators give two very
different lists from the same limits. The `Keep` lock is in the table for the same reason as on the bulk page: a staple is exactly
the card that must never go to the bulk box. **The lock does not move a row here**, because the
lists ask about ownership and not about the lock.

## The card popup

The thumbnail opens the **meta-deck popup**, and not the card detail popup: the list is for the
scan, and this is for the analysis. It gives the art, the copies you own against the playset target,
and one row for each deck above the limit with the metashare of the deck, the play rate, the average
copies, the deck count and the win rate. A Field run has one row, the popularity and the average
copies only, for the reason in "The three modes". An Overlap run puts the meta decks first and the
field row last, thus the CSV reads the **last** row for the average copies of the whole format. A
button in it opens the usual read-only
`CardDetailModal`. **The two popups never show at one time** — the page hides the meta-deck popup
while the detail popup is open, thus one backdrop cannot sit over the other.
