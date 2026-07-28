import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import { ZONES, deckEntries, mainWithChampion } from '../lib/deck.js';
import { money, ownedAcrossPrintings } from '../lib/cards.js';
import { deckPrice } from '../lib/deck.js';

export default function DecksPage() {
  const { cardsById, ownedIndex, decks, reloadDecks, loading } = useApp();

  const remove = async (deck) => {
    if (!window.confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) return;
    await api.deleteDeck(deck.id);
    reloadDecks();
  };

  if (loading) return <div className="page-loading">Loading decks…</div>;

  return (
    <div>
      <h1 className="page-title">My Decks</h1>
      <p className="page-sub">
        {decks.length} saved deck{decks.length === 1 ? '' : 's'} ·{' '}
        <Link to="/deckbuilder">create a new deck</Link>
      </p>
      <div className="deck-cards">
        {decks.map((deck) => {
          const legend = deck.legend ? cardsById.get(deck.legend) : null;
          let missing = 0;
          for (const { cardId, count, zone } of deckEntries(deck)) {
            if (zone === 'bench') continue;
            const owned = ownedAcrossPrintings(cardsById.get(cardId), ownedIndex).total;
            missing += Math.max(0, count - owned);
          }
          return (
            <div className="deck-summary" key={deck.id}>
              {legend ? (
                <img src={legend.image} alt={legend.name} loading="lazy" />
              ) : (
                <div style={{ width: 64 }} />
              )}
              <div className="info">
                <div className="nm">
                  <Link to={`/decks/view/${deck.id}`}>{deck.name || 'Untitled deck'}</Link>
                </div>
                <div className="sub">
                  {legend ? legend.name : 'No legend'} · {mainWithChampion(deck)}/{ZONES.main.max}{' '}
                  main ·{' '}
                  {money(deckPrice(deck, cardsById))}
                </div>
                <div className="sub">
                  {missing === 0 ? (
                    <span style={{ color: 'var(--green)' }}>All cards owned</span>
                  ) : (
                    <span style={{ color: 'var(--red)' }}>{missing} copies missing</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link to={`/deckbuilder/${deck.id}`}>
                  <button>Edit</button>
                </Link>
                <button className="danger" onClick={() => remove(deck)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
