import React from 'react';

// Deck / Stats / Collection, the tab strip both the builder's side panel and the
// deck viewer carry. The three tabs are the same three on both screens, so they
// live here rather than being spelled out twice.
export const DECK_TABS = [
  { id: 'deck', label: 'Deck' },
  { id: 'stats', label: 'Stats' },
  { id: 'collection', label: 'Collection' },
];

export default function DeckTabs({ value, onChange }) {
  return (
    <div className="deck-tabs">
      {DECK_TABS.map((t) => (
        <button key={t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
