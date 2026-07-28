import React, { useMemo } from 'react';
import { useApp } from '../state.jsx';
import { deckEntries } from '../lib/deck.js';
import { effectivePrice, money, ownedAcrossPrintings, wishlistQty } from '../lib/cards.js';

// Shared by the deck builder side tab and the deck viewer collection tab:
// shows, for every card in the deck, how many copies you own vs need.
export default function DeckCollectionList({ deck, allowWishlist = false }) {
  const { cardsById, ownedIndex, wishlist, setWishlistQty } = useApp();

  const rows = useMemo(() => {
    const merged = new Map();
    for (const { cardId, count, zone } of deckEntries(deck)) {
      if (zone === 'bench') continue;
      merged.set(cardId, (merged.get(cardId) || 0) + count);
    }
    return [...merged.entries()]
      .map(([cardId, needed]) => {
        const card = cardsById.get(cardId);
        const owned = ownedAcrossPrintings(card, ownedIndex).total;
        return {
          card,
          cardId,
          needed,
          owned,
          missing: Math.max(0, needed - owned),
        };
      })
      .sort((a, b) => b.missing - a.missing || (a.card?.name || '').localeCompare(b.card?.name || ''));
  }, [deck, cardsById, ownedIndex]);

  const totals = useMemo(() => {
    let missingCopies = 0;
    let cost = 0;
    for (const r of rows) {
      missingCopies += r.missing;
      if (r.card) cost += r.missing * (effectivePrice(r.card) || 0);
    }
    return { missingCopies, cost };
  }, [rows]);

  const missingRows = rows.filter((r) => r.missing > 0);

  // The deck says exactly how many copies are short, which is a better wishlist
  // quantity than the playset default the ★ button uses.
  const wishlistAllMissing = () => {
    for (const r of missingRows) {
      if (wishlistQty(wishlist, r.cardId) < r.missing) setWishlistQty(r.cardId, r.missing);
    }
  };

  return (
    <div>
      <div className="hstack" style={{ marginBottom: 8 }}>
        <span className={`pill ${totals.missingCopies === 0 ? 'green' : 'red'}`}>
          {totals.missingCopies === 0
            ? 'Complete — you own every card'
            : `Missing ${totals.missingCopies} copies · ~${money(totals.cost)} to complete`}
        </span>
        {allowWishlist && missingRows.length > 0 && (
          <button onClick={wishlistAllMissing}>Wishlist all missing</button>
        )}
      </div>
      {rows.map((r) => (
        <div className="coll-sync-row" key={r.cardId}>
          <span className="nm" title={r.card?.name || r.cardId}>
            {r.card?.name || r.cardId}
          </span>
          <span className={`have ${r.missing > 0 ? 'short' : 'ok'}`}>
            {Math.min(r.owned, r.needed)}/{r.needed}
            {r.owned > r.needed ? ` (+${r.owned - r.needed})` : ''}
          </span>
          {allowWishlist && r.missing > 0 && (
            <button
              className={wishlistQty(wishlist, r.cardId) > 0 ? 'primary' : ''}
              title={
                wishlistQty(wishlist, r.cardId) > 0
                  ? 'Remove from wishlist'
                  : `Wishlist the ${r.missing} missing`
              }
              onClick={() =>
                setWishlistQty(r.cardId, wishlistQty(wishlist, r.cardId) > 0 ? 0 : r.missing)
              }
            >
              {wishlistQty(wishlist, r.cardId) > 0
                ? `★ Wishlisted ${wishlistQty(wishlist, r.cardId)}`
                : '☆ Wishlist'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
