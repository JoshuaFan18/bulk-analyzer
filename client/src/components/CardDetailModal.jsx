// Rules: docs/components.md
import React, { useEffect } from 'react';
import CardArt from './CardArt.jsx';
import Modal from './Modal.jsx';
import CardText from './CardText.jsx';
import { useApp } from '../state.jsx';
import {
  cardKeywords,
  cardPageUrl,
  effectivePrice,
  money,
  ownedAcrossPrintings,
  setLabel,
  tcgPlayerUrl,
} from '../lib/cards.js';
import { decodeEntities, parseCardText } from '../lib/cardText.js';

// "Unit · Champion", "Legend", "Spell" — the line under the card name.
function typeLine(card) {
  return [card.type, card.supertype].filter(Boolean).join(' · ') || 'Card';
}

// A finish the printing does not come in, and one with no price data, both read
// as "—" rather than $0.00 — the same rule effectivePrice follows.
function finishPrice(has, value) {
  return has && value > 0 ? money(value) : '—';
}

function Fact({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="cd-fact">
      <span className="cd-label">{label}</span>
      <span className="cd-value">{children}</span>
    </div>
  );
}

// The full card, opened from the ⤢ button on a deck row. Read-only: it is a
// reference view, so nothing here changes the deck or the collection.
export default function CardDetailModal({ card, onClose }) {
  const { ownedIndex } = useApp();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!card) return null;

  const owned = ownedAcrossPrintings(card, ownedIndex);
  const keywords = [...cardKeywords(card)];
  const hasRules = parseCardText(card.effect).length > 0;
  const domains = (card.colors || []).join(' / ');
  const buy = tcgPlayerUrl(card);
  const page = cardPageUrl(card);

  return (
    <Modal
      className="wide card-detail"
      onClose={onClose}
      title={
        <>
          <span className="cd-heading">
            <span className="cd-name">{card.name}</span>
            <span className="cd-type">{typeLine(card)}</span>
            {card.banned && <span className="banned-pill">BANNED</span>}
          </span>
          <button className="cd-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </>
      }
    >
      <div className="cd-body">
        <div className="cd-art">
          <CardArt card={card} />
        </div>

        <div className="cd-info">
          <div className="cd-stats">
            {card.cost != null && (
              <div className="cd-stat">
                <span className="cd-label">Energy</span>
                <span className="cd-stat-value">{card.cost}</span>
              </div>
            )}
            {/* The colored cost, merged onto the card in state.jsx. Null for
                anything with no power concept, which is not the same as 0. */}
            {card.power != null && (
              <div className="cd-stat">
                <span className="cd-label">Power</span>
                <span className="cd-stat-value">{card.power}</span>
              </div>
            )}
            {card.might != null && (
              <div className="cd-stat">
                <span className="cd-label">Might</span>
                <span className="cd-stat-value">{card.might}</span>
              </div>
            )}
          </div>

          <div className="cd-section">
            <span className="cd-label">Rules</span>
            {hasRules ? (
              <CardText effect={card.effect} />
            ) : (
              <div className="muted cd-none">No rules text.</div>
            )}
          </div>

          {card.errata && (
            <div className="cd-section">
              <span className="cd-label">Errata</span>
              <div className="cd-errata">{decodeEntities(card.errata)}</div>
            </div>
          )}

          {card.flavor && <div className="cd-flavor">{decodeEntities(card.flavor)}</div>}

          <div className="cd-section divided">
            <span className="cd-label">Card information</span>
            <div className="cd-facts">
              <Fact label="Set">{setLabel(card)}</Fact>
              <Fact label="Rarity">{card.rarity}</Fact>
              <Fact label="Domain">{domains}</Fact>
              <Fact label="Card number">{card.id}</Fact>
              <Fact label="Keywords">{keywords.join(', ')}</Fact>
              <Fact label="Tags">{(card.tags || []).join(', ')}</Fact>
            </div>
          </div>

          <div className="cd-owned">
            {owned.total > 0
              ? `You own ${owned.total} across printings (${owned.normal} normal, ${owned.foil} foil)`
              : 'You do not own a copy of this card'}
          </div>

          <div className="cd-links">
            {buy ? (
              <a className="cd-buy" href={buy} target="_blank" rel="noreferrer">
                <span>Buy on TCGplayer</span>
                <span className="cd-price">{money(effectivePrice(card))}</span>
              </a>
            ) : (
              <span className="muted cd-none">No TCGplayer listing for this printing</span>
            )}
            {page && (
              <a href={page} target="_blank" rel="noreferrer">
                Full card page ↗
              </a>
            )}
          </div>
          <div className="cd-prices muted">
            Normal {finishPrice(card.hasNormal, card.price)} · Foil{' '}
            {finishPrice(card.hasFoil, card.foilPrice)}
          </div>
        </div>
      </div>
    </Modal>
  );
}
