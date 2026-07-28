import React, { useState } from 'react';
import { effectivePrice, money } from '../lib/cards.js';
import { KEEP_TAG, isReservedTag } from '../lib/tags.js';

function Stepper({ value, onChange, disabled }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(value - 1)} disabled={disabled || value <= 0}>
        −
      </button>
      <span className={`qty ${value === 0 ? 'zero' : ''}`}>{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={disabled}>
        +
      </button>
    </div>
  );
}

// Adding a custom tag. The datalist offers names already in use so the same tag
// does not end up spelled three ways.
function AddTag({ suggestions, onAdd }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const commit = () => {
    const name = value.trim();
    if (name && !isReservedTag(name)) onAdd(name);
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="tag-chip add" title="Add a tag" onClick={() => setOpen(true)}>
        +
      </button>
    );
  }
  return (
    <input
      className="tag-input"
      list="custom-tag-names"
      autoFocus
      value={value}
      placeholder="tag…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setValue('');
          setOpen(false);
        }
      }}
    />
  );
}

export default function CardTile({
  card,
  entry,
  onSetQty,
  wishlistQty = 0,
  onToggleWishlist,
  onSetWishlistQty,
  tags = [],
  tagSuggestions = [],
  onAddTag,
  onRemoveTag,
}) {
  const normal = entry?.normal || 0;
  const foil = entry?.foil || 0;
  const owned = normal + foil > 0;
  const wishlisted = wishlistQty > 0;
  const kept = tags.some((t) => t.kind === 'keep');

  return (
    <div className={`card-tile ${owned ? 'owned' : ''}`}>
      <div className={`card-img-wrap ${owned ? '' : 'not-owned'}`}>
        <img
          className="card-img"
          src={card.image}
          alt={card.name}
          loading="lazy"
          decoding="async"
        />
        {card.banned && <span className="banned-tag">BANNED</span>}
        <button
          className={`wish-btn ${wishlisted ? 'on' : ''}`}
          title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          onClick={() => onToggleWishlist(card.id, card)}
        >
          ★
        </button>
        <button
          className={`keep-btn ${kept ? 'on' : ''}`}
          title={kept ? `Remove the ${KEEP_TAG} tag` : `Tag as ${KEEP_TAG} (never bulk)`}
          onClick={() => (kept ? onRemoveTag(card.id, KEEP_TAG) : onAddTag(card.id, KEEP_TAG))}
        >
          🔒
        </button>
      </div>
      <div className="tile-body">
        <div className="tile-name" title={card.name}>
          {card.name}
        </div>
        <div className="tile-meta">
          <span>
            {card.id} · {card.rarity || card.supertype || card.type}
          </span>
          <span className="tile-price">{money(effectivePrice(card))}</span>
        </div>
        <div className="tag-row">
          {tags.map((t) => (
            <span key={t.name} className={`tag-chip ${t.kind}`} title={t.title || t.name}>
              {t.name}
              {t.kind === 'keep' || t.kind === 'custom' ? (
                <button title={`Remove ${t.name}`} onClick={() => onRemoveTag(card.id, t.name)}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
          <AddTag suggestions={tagSuggestions} onAdd={(name) => onAddTag(card.id, name)} />
        </div>
        {card.hasNormal ? (
          <div className="qty-row">
            <span className="qty-label">NORMAL</span>
            <Stepper value={normal} onChange={(v) => onSetQty(card.id, 'normal', v)} />
          </div>
        ) : (
          <div className="qty-row">
            <span className="only-foil">Only foil printing</span>
          </div>
        )}
        {card.hasFoil && (
          <div className="qty-row">
            <span className="qty-label foil">FOIL</span>
            <Stepper value={foil} onChange={(v) => onSetQty(card.id, 'foil', v)} />
          </div>
        )}
        {wishlisted && (
          <div className="qty-row">
            <span className="qty-label wish">WANT</span>
            <Stepper value={wishlistQty} onChange={(v) => onSetWishlistQty(card.id, v)} />
          </div>
        )}
      </div>
    </div>
  );
}
