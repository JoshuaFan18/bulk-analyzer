# Surplus rules

Read this before you edit [SurplusPage](../client/src/pages/SurplusPage.jsx). See also
[CLAUDE.md](../CLAUDE.md) for the always-true core, in particular the "Printings, prices and
ownership" section that this page depends on.

[SurplusPage](../client/src/pages/SurplusPage.jsx) shows the copies above `deckCopyLimit`, which no
deck can use. The page reads the **collection** and not `cards`, because a surplus exists only for
the cards that you own.

- The copies fold across the printings by `cardIdentity`, and the row shows
  `dedupeByIdentity(printings)[0]`. A foil counts for the limit as a normal card does.
- **The surplus value assumes that you keep the most expensive copies.** The page gives a value to
  each copy (`collectionValue`), sorts them, and the copies after `limit` are the surplus.
  `surplus × effectivePrice` gives an incorrect value for a group with many foils.
- The page removes the tokens, the cards with the `Keep` tag, and the collection ids that are not in
  the card database, and reports a quantity for each. A folded row has the `Keep` tag when **any** of
  its printings has the tag.
