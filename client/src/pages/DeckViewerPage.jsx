import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import DeckStats from '../components/DeckStats.jsx';
import DeckCollectionList from '../components/DeckCollectionList.jsx';
import DeckExportModal from '../components/DeckExportModal.jsx';
import DeckImageModal from '../components/DeckImageModal.jsx';
import DeckTabs from '../components/DeckTabs.jsx';
import CardArt from '../components/CardArt.jsx';
import CardDetailModal from '../components/CardDetailModal.jsx';
import { COLOR_HEX, money, ownedAcrossPrintings } from '../lib/cards.js';
import {
  MAIN_GROUPS,
  inMainGroup,
  ZONES,
  deckColors,
  deckPrice,
  emptyDeck,
  mainWithChampion,
  zoneCount,
} from '../lib/deck.js';

export default function DeckViewerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { cardsById, ownedIndex, reloadDecks } = useApp();
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('deck');
  const [showExport, setShowExport] = useState(false);
  const [showImage, setShowImage] = useState(false);
  // The id, not the card, so an open popup shows the new price after a refresh.
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    api
      .getDeck(id)
      .then((d) => setDeck({ ...emptyDeck(), ...d }))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div>
        <div className="error-banner">Could not load deck: {error}</div>
        <p>
          <Link to="/decks">Back to My Decks</Link>
        </p>
      </div>
    );
  }
  if (!deck) return <div className="page-loading">Loading deck…</div>;

  const legend = deck.legend ? cardsById.get(deck.legend) : null;
  const champion = deck.champion ? cardsById.get(deck.champion) : null;
  const colors = deckColors(deck, cardsById);
  const price = deckPrice(deck, cardsById);

  const remove = async () => {
    if (!window.confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) return;
    await api.deleteDeck(deck.id);
    reloadDecks();
    navigate('/decks');
  };

  return (
    <div>
      <div className="viewer-head">
        {legend && <CardArt className="legend-art" card={legend} />}
        <div className="viewer-title" style={{ flex: 1, minWidth: 240 }}>
          <h2>{deck.name || 'Untitled deck'}</h2>
          <div className="viewer-badges">
            {colors.map((c) => (
              <span
                key={c}
                className="pill"
                style={{ borderColor: COLOR_HEX[c], color: COLOR_HEX[c] }}
              >
                {c}
              </span>
            ))}
            <span className="pill gold">{money(price)}</span>
            <span className="pill">
              {mainWithChampion(deck)}/{ZONES.main.max} main
            </span>
            <span className="pill">{zoneCount(deck.runes)}/12 runes</span>
            <span className="pill">{zoneCount(deck.battlefields)}/3 battlefields</span>
          </div>
          <div className="muted">
            {legend ? `Legend: ${legend.name}` : 'No legend'}
            {champion ? ` · Chosen Champion: ${champion.name}` : ''}
            {deck.updatedAt ? ` · updated ${new Date(deck.updatedAt).toLocaleString()}` : ''}
          </div>
          <div className="viewer-actions" style={{ marginTop: 10 }}>
            <Link to={`/deckbuilder/${deck.id}`}>
              <button className="primary">Edit deck</button>
            </Link>
            <button onClick={() => setShowExport(true)}>Export</button>
            <button onClick={() => setShowImage(true)}>Export image</button>
            <button className="danger" onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <DeckTabs value={tab} onChange={setTab} />

      {tab === 'deck' && (
        <DeckSections
          deck={deck}
          cardsById={cardsById}
          ownedIndex={ownedIndex}
          onOpen={setDetailId}
        />
      )}
      {tab === 'stats' && (
        <div style={{ maxWidth: 420 }}>
          <DeckStats deck={deck} />
        </div>
      )}
      {tab === 'collection' && (
        <div style={{ maxWidth: 640 }}>
          <p className="muted">
            Owned copies count both normal and foil printings. Tag any missing card as wishlisted
            — wishlisted cards show up under “Show: Wishlisted” in the collection manager.
          </p>
          <DeckCollectionList deck={deck} allowWishlist />
        </div>
      )}

      {detailId && (
        <CardDetailModal card={cardsById.get(detailId)} onClose={() => setDetailId(null)} />
      )}

      {showExport && (
        <DeckExportModal deck={deck} cardsById={cardsById} onClose={() => setShowExport(false)} />
      )}
      {showImage && (
        <DeckImageModal deck={deck} cardsById={cardsById} onClose={() => setShowImage(false)} />
      )}
    </div>
  );
}

function CardCell({ card, cardId, count, owned, onOpen }) {
  const missing = Math.max(0, count - owned);
  if (!card) {
    return (
      <div className="viewer-card">
        <div style={{ padding: 20 }}>{cardId}</div>
      </div>
    );
  }
  return (
    <div className="viewer-card" title={card.name}>
      <button type="button" className="vc-art" onClick={() => onOpen(cardId)}>
        <CardArt card={card} />
      </button>
      <span className="vc-count">×{count}</span>
      {missing > 0 && <span className="vc-missing">missing {missing}</span>}
    </div>
  );
}

function DeckSections({ deck, cardsById, ownedIndex, onOpen }) {
  const sections = useMemo(() => {
    const byCost = (a, b) =>
      (a.card?.cost ?? 99) - (b.card?.cost ?? 99) ||
      (a.card?.name || '').localeCompare(b.card?.name || '');
    const zoneItems = (zone) =>
      Object.entries(deck[zone] || {})
        .map(([cardId, count]) => ({ cardId, count, card: cardsById.get(cardId) }))
        .sort(byCost);
    const total = (items) => items.reduce((s, i) => s + i.count, 0);
    const zoneCards = (zone, label) => {
      const items = zoneItems(zone);
      if (items.length === 0) return null;
      return { label: `${label} (${total(items)})`, items };
    };
    // The main deck splits into Units / Spells / Gear the same way the deck
    // builder's "By Type" grouping does, sharing MAIN_GROUPS so the buckets and
    // the catch-all stay identical on both screens.
    const mainSections = () => {
      const items = zoneItems('main');
      if (items.length === 0) return [];
      return MAIN_GROUPS.map(({ label, types }) => {
        const group = items.filter((i) => inMainGroup(i.card, types));
        return group.length ? { label: `${label} (${total(group)})`, items: group } : null;
      }).filter(Boolean);
    };
    const top = {
      label: 'Legend & Chosen Champion',
      items: [
        deck.legend && { cardId: deck.legend, count: 1, card: cardsById.get(deck.legend) },
        deck.champion && { cardId: deck.champion, count: 1, card: cardsById.get(deck.champion) },
      ].filter(Boolean),
    };
    return [
      top.items.length ? top : null,
      zoneCards('battlefields', 'Battlefields'),
      zoneCards('runes', 'Runes'),
      ...mainSections(),
      zoneCards('side', 'Sideboard'),
      zoneCards('bench', 'The Bench'),
    ].filter(Boolean);
  }, [deck, cardsById]);

  if (sections.length === 0) return <p className="muted">This deck is empty.</p>;

  return (
    <>
      {sections.map((section) => (
        <div className="viewer-section" key={section.label}>
          <h3>{section.label}</h3>
          <div className="viewer-grid">
            {section.items.map(({ cardId, count, card }) => (
              <CardCell
                key={cardId}
                card={card}
                cardId={cardId}
                count={count}
                owned={ownedAcrossPrintings(card, ownedIndex).total}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
