# True Bulk rules

Read this before you edit [BulkAnalyzerPage](../client/src/pages/BulkAnalyzerPage.jsx). See also
[CLAUDE.md](../CLAUDE.md) for the always-true core, in particular the "Printings, prices and
ownership" section that this page depends on.

The business logic is in [BulkAnalyzerPage](../client/src/pages/BulkAnalyzerPage.jsx), and not in the
server. A card is true bulk when **all** of these conditions are true:

- The rarity is Common or Uncommon, and the card is not a Rune and not a token (`isToken`).
- The card does not have the `Keep` tag. The page reports the quantity that it removed.
  - The run stores **one flat row list**, and each row carries the `home` list that its price and
    its play rate give **with the lock ignored**. The page reads the tag at the render and puts
    every locked row into the "Locked by Keep" list. Thus the lock button moves a card between the
    lists **at the click** and not at the next run, and a re-run gives the same lists that are on
    the screen. All the counts and the totals read this live partition.
- You own a minimum of 1 **normal** copy. A foil never counts.
- The normal price is less than the price limit (`DEFAULT_PRICE_LIMIT`, $0.20). A null price or a 0
  price is unknown, and the page removes that card. Do not think that it is inexpensive.
- The maximum play rate across the meta legends is less than or equal to the play-rate limit
  (`DEFAULT_PLAY_RATE_LIMIT`, 10%). A card above the limit goes into the "protected by meta" list.
- **Optional — field popularity.** A checkbox turns on a second protection test that reads the same
  staples list as the Staples analyzer (`api.getStaples`, `data/meta-cache/staples.json`). When on,
  a card whose popularity is **more than** the popularity limit (`DEFAULT_POPULARITY_LIMIT`, 10%) is
  protected too, on the same footing as a high play rate: `protectedByMeta = played || popular`. The
  limit is strictly greater, thus a card **at** the limit is still bulk, the same rule the play rate
  uses. The test is **off by default**, thus a run without it is exactly the old run. The popularity is a share of the most
  played card, not a share of the lists — the same measure the Staples Field mode uses, and the two
  pages must agree about it. A card missing from the staples list is below the list floor
  (`minPopularity`, 1%), thus a null popularity **passes** the test and is not protected. The run
  fetches the staples list first (phase `staples`), then the legends and maps as before, and never
  sends `refresh`. When the test ran, the table gains a **Field popularity** column, the source note
  names the list, and the CSV gains a `FieldPopularity` column.

The user can change the limits, but a reload gives the defaults again. The page puts the values
into `result` and the text reads them from `result`, thus a change after a run cannot make the text
different from the table.

The page scans **every legend** on the legends page, and a `sharePct` of 0 does not exclude one,
because a fringe deck still protects the cards that it plays. The pill list shows each legend that
the run scanned with its share. A meta map always uses `date_range=all&relevance=3`. The riftdecks names and ids do not
match the DotGG ids correctly, thus the page records the usage under three keys: the exact id, the
id with no variant (`OGN-039a` becomes `OGN-039`), and `n:<normName>`. The lookup takes the highest
play rate of the keys that it finds.

`metagame_id`: 1 is Origins, 2 is Spiritforged, 3 is Unleashed, 4 is Vendetta. Set codes: Origins is
OGN, Origins Starter / Proving Grounds is OGS, Spiritforged is SFD, Unleashed is UNL, Vendetta is
VEN, Arcane Box Set is ARC.
