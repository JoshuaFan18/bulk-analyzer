// Rules: docs/libraries.md
// Card tags. Three kinds share one control and one chip row:
//
//   - custom tags, stored per printing id in data/tags.json
//   - derived tags ([Wishlisted], [In Deck]), never stored — they are computed
//     from the wishlist and the saved decks
//   - API tags from DotGG (Ionia, Yordle, Ahri, …), which are filterable but
//     deliberately never rendered on a tile: 128 distinct values would bury the
//     handful of tags the user actually set.
//
// Tags key on the printing id rather than cardIdentity, matching the collection
// manager — tagging OGN-042 as Keep does not tag the VEN-R02 reprint, because
// that is a different physical card.

export const KEEP_TAG = 'Keep';
export const WISHLISTED_TAG = 'Wishlisted';
export const IN_DECK_TAG = 'In Deck';

// Derived chips. Storing one as a custom tag would produce a duplicate chip
// that could never be removed by the thing that derives it.
export const RESERVED_TAGS = new Set([WISHLISTED_TAG, IN_DECK_TAG]);

export function isReservedTag(name) {
  const n = String(name || '').trim().toLowerCase();
  return [...RESERVED_TAGS].some((r) => r.toLowerCase() === n);
}

export function cardTags(tags, cardId) {
  return tags?.[cardId] || [];
}

export function hasTag(tags, cardId, name) {
  return cardTags(tags, cardId).includes(name);
}

// Every custom tag name in use, for the filter dropdown and the add-tag
// autocomplete.
export function allCustomTags(tags) {
  const seen = new Set();
  for (const list of Object.values(tags || {})) {
    for (const name of list) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Every API tag in use across the card database.
export function allApiTags(cards) {
  const seen = new Set();
  for (const card of cards) {
    for (const name of card.tags || []) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// The ordered chip list for a card tile: derived tags first, then Keep, then
// the rest of the custom tags. API tags are excluded on purpose.
export function displayTags(cardId, { tags, wishlist, inDeckIndex } = {}) {
  const out = [];
  if (wishlist?.[cardId]) out.push({ name: WISHLISTED_TAG, kind: 'wishlist' });
  const decks = inDeckIndex?.get(cardId);
  if (decks?.length) {
    out.push({ name: IN_DECK_TAG, kind: 'indeck', title: decks.join(', ') });
  }
  for (const name of cardTags(tags, cardId)) {
    out.push({ name, kind: name === KEEP_TAG ? 'keep' : 'custom' });
  }
  return out;
}

// Encoded as "api:Ionia" / "custom:Keep" / "auto:wishlist" so one select can
// offer all three kinds without needing three controls.
export function matchesTagFilter(card, value, { tags, wishlist, inDeckIndex } = {}) {
  if (!value || value === 'any') return true;
  const sep = value.indexOf(':');
  const kind = value.slice(0, sep);
  const name = value.slice(sep + 1);
  if (kind === 'api') return (card.tags || []).includes(name);
  if (kind === 'custom') return hasTag(tags, card.id, name);
  if (kind === 'auto') {
    if (name === 'wishlist') return !!wishlist?.[card.id];
    if (name === 'indeck') return !!inDeckIndex?.get(card.id)?.length;
    if (name === 'untagged') return cardTags(tags, card.id).length === 0;
  }
  return true;
}
