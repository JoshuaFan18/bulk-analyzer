# Deck builder — filters and legality

Read this before you edit [DeckBuilderPage](../client/src/pages/DeckBuilderPage.jsx),
[DeckFilterModal](../client/src/components/DeckFilterModal.jsx),
[DeckImageModal](../client/src/components/DeckImageModal.jsx) or the legality rules in
[lib/deck.js](../client/src/lib/deck.js). The image export (the last section) also mounts on
[DeckViewerPage](../client/src/pages/DeckViewerPage.jsx), so read that section before you touch the
"Export image" wiring there. See also [libraries.md](libraries.md) for the deck model and
[CLAUDE.md](../CLAUDE.md) for the always-true core.

## Filter modal

[DeckFilterModal](../client/src/components/DeckFilterModal.jsx) has the deck builder filters, and
each option shows the quantity that it gives with all the *other* filters applied. `filterGroups`
and `poolCounts` in [DeckBuilderPage](../client/src/pages/DeckBuilderPage.jsx) calculate all the
counts in **one pass**, and the counts group by `cardIdentity`. Do not calculate the pool again for
each option. The domain row follows the legend. With no legend the modal hides TYPE, ENERGY, POWER,
MIGHT and RARITY, but keeps their values and gives the name of each hidden filter that is active.
`atLimitIds` is built only when the "Available to add" toggle is on **or** the modal is open, thus
its predicate must read the toggle and not the set.

## Deck legality

The builder pool ([DeckBuilderPage](../client/src/pages/DeckBuilderPage.jsx)) applies these rules, and
`deckValidation(deck, cardsById)` in [lib/deck.js](../client/src/lib/deck.js) applies them again. A
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

## Image export

The "Export image" button opens [DeckImageModal](../client/src/components/DeckImageModal.jsx). Both
[DeckBuilderPage](../client/src/pages/DeckBuilderPage.jsx) and
[DeckViewerPage](../client/src/pages/DeckViewerPage.jsx) mount the same button and the same modal, so
a change to the picture must serve both. The modal draws the whole deck onto a `<canvas>` and saves
it as one PNG. The canvas is drawn at full resolution and the CSS scales the preview down, thus the
download keeps the full-size pixels.

- **The card art comes from the DotGG CDN, which sends `Access-Control-Allow-Origin: *`.** The modal
  loads each image with `crossOrigin = 'anonymous'`, thus the canvas stays clean and `toBlob` works.
  Without both of these the canvas is **tainted** and the export throws. Do not change the image
  source (`card.image`) or remove the flag.
- **The layout has two columns and a bottom band**, to fill the space beside the small zones. The
  left column has the Legend and the Chosen Champion in the top row, then the Battlefields. The right
  column has the Main Deck, and under it the band with the Runes and the Sideboard side by side. A
  deck with no left zone gets one full-width column instead.
  - The **Legend and the Champion cells are larger** than a Main-Deck cell (`BIG_SCALE`), because
    they are the identity of the deck. The left column is two of these cells wide.
  - The **Runes and the Sideboard cells are smaller**, so the two zones fit on one line.
    `BOTTOM_COLS` is the columns of one zone, and the cell width always comes from a band of **two**
    slots. Thus a deck with only one of the two zones keeps the same cell size and takes more
    columns, and the cells do not change size with the contents.
  - The **Main Deck rows are centred** in their column (the `center` flag of `drawSection`), thus a
    part-filled last row does not hang to the left.
  - **Each column flows on its own.** The Main Deck starts at the top of its column, and the band
    follows the Main Deck and not the left column. Do not align the two columns against each other:
    that opens a grey band above or under the Main Deck when the left column is the taller one. The
    canvas height is the taller of the two columns.
- **The Bench is not in the picture.** It is the "considering" pile and not part of the deck that the
  picture shows.
- The sections come from `deckImageSections(deck, cardsById)` in
  [lib/deck.js](../client/src/lib/deck.js). The cards are in **alphabetical order** in each section. A
  card id that the database does not have keeps its row as a placeholder tile, thus an imported deck
  loses no card in the picture.
- **Each cell is portrait, and the battlefield cell is the one exception**: it is landscape,
  `FIELD_SCALE` of the width of the left column, and the battlefields stack one on top of the other.
  The ratio is always the fixed `FALLBACK_ASPECT` (744×1039, ≈1.397 tall) one way or the other. Do
  not read the ratio from a loaded file: the CDN sends most battlefields **landscape** and four of
  them **portrait**, and one landscape file first in the map made all of the cells short and wide.
  `drawCard` turns a file a quarter turn counter-clockwise when its shape does not match its cell,
  which is the same rule as [CardArt](../client/src/components/CardArt.jsx) on the screen (see
  [components.md](components.md)). The Legend and the Champion are always one copy, thus they wear no
  `×count` badge.
