# Staples rules

Read this before you edit [StaplesAnalyzerPage](../client/src/pages/StaplesAnalyzerPage.jsx). See
also [CLAUDE.md](../CLAUDE.md) for the always-true core, and
[docs/bulk-analyzer.md](bulk-analyzer.md), because the two pages read the **same meta cache** and
must stay in agreement about it.

The page answers the opposite question to the True Bulk analyzer: which cards does the meta play in
almost every list. The business logic is in the page, and not in the server.

## The rule

A card is a staple when its play rate is **more than** the limit (`DEFAULT_STAPLE_LIMIT`, 50%) in a
minimum of **one** scanned deck. The limit is strictly greater, thus a card at exactly 50% is not a
staple. The user can change the limit, but a reload gives the default again. The page puts the value
into `result`, and the text reads it from `result`, thus a change after a run cannot make the text
different from the list.

The rule reads the play rate only. The price, the rarity and the ownership have no effect, thus a
card that you do not own is in the list. The detail panel shows the copies that you own, folded
across the printings (`ownedAcrossPrintings`), because the list holds one row for each card.

## The data

The page uses `api.getMetaLegends` and `api.getMetaMap`, the same two endpoints and the same
`data/meta-cache/` files as the True Bulk analyzer. **It never sends `refresh`**, thus a run is
local and inexpensive after the first one. The Config page is the one place that gets fresh data.

The page scans **every legend** on the legends page, and a `sharePct` of 0 does not exclude one: a
fringe deck that plays a card in each of its lists still shows a staple of that deck.

The riftdecks names and ids do not match the DotGG ids correctly, thus the page records the usage
under the same three keys as the bulk analyzer: the exact id, the id with no variant (`OGN-039a`
becomes `OGN-039`), and `n:<normName>`. **The usage map holds one entry for each legend under each
key**, and not one maximum for all the legends, because this page must show the play rate of each
deck. The lookup merges the three keys and keeps the highest play rate **for each legend**, thus a
card that resolves on two keys cannot count one deck two times.

A card above the limit on riftdecks.com that no printing matches cannot reach the list. The page
counts these and gives the names under the list. **Do not remove that text.** Without it a parser
change makes staples disappear in silence.

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
sort). The `Keep` lock is in the table for the same reason as on the bulk page: a staple is exactly
the card that must never go to the bulk box. **The lock does not move a row here**, because the
lists ask about ownership and not about the lock.

## The card popup

The thumbnail opens the **meta-deck popup**, and not the card detail popup: the list is for the
scan, and this is for the analysis. It gives the art, the copies you own against the playset target,
and one row for each deck above the limit with the metashare of the deck, the play rate, the average
copies, the deck count and the win rate. A button in it opens the usual read-only
`CardDetailModal`. **The two popups never show at one time** — the page hides the meta-deck popup
while the detail popup is open, thus one backdrop cannot sit over the other.
