# Deck builder — filters and legality

Read this before you edit [DeckBuilderPage](../client/src/pages/DeckBuilderPage.jsx),
[DeckFilterModal](../client/src/components/DeckFilterModal.jsx) or the legality rules in
[lib/deck.js](../client/src/lib/deck.js). See also [libraries.md](libraries.md) for the deck model
and [CLAUDE.md](../CLAUDE.md) for the always-true core.

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
