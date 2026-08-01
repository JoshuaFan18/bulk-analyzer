import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { deckImageSections } from '../lib/deck.js';

// The deck picture: a title, then the deck laid out in two columns like a deck
// list — the small zones (Legend, Champion, Battlefields, Runes) stacked in a
// narrow left column, the Main Deck and Sideboard filling the wide right one, so
// nothing sits beside a wall of empty background. The whole thing is drawn onto
// a canvas so it exports as a single PNG. The DotGG CDN sends
// `Access-Control-Allow-Origin: *`, so the art loads with crossOrigin set and
// the canvas stays untainted — toBlob would throw otherwise.

// Layout metrics in canvas pixels. The card art is 744×1039 (≈1.397 tall), and
// FALLBACK_ASPECT keeps a placeholder-only deck laid out the same way.
const PAD = 56;
const GAP = 22;
const CARD_W = 250;
const ROW_GAP = 22;
const HEADER_H = 60;
const SECTION_GAP = 34;
const TITLE_H = 128;
const FALLBACK_ASPECT = 1039 / 744;

// The two columns: the left holds the small zones two cards wide, the right the
// Main Deck and Sideboard six cards wide, with a gutter between them. A deck
// missing one whole side falls back to a single full-width column.
const LEFT_COLS = 2;
const RIGHT_COLS = 6;
const FULL_COLS = LEFT_COLS + RIGHT_COLS;
const COLUMN_GUTTER = 48;
const LEFT_ZONES = ['legend', 'champion', 'battlefields', 'runes'];
const RIGHT_ZONES = ['main', 'side'];

const BG = '#242424';
const TITLE_COLOR = '#ffffff';
const LABEL_COLOR = '#eef0f2';
const ACCENT = '#d9b25a';
const DIVIDER = 'rgba(255, 255, 255, 0.14)';
const CARD_BORDER = 'rgba(255, 255, 255, 0.10)';
const PLACEHOLDER_BG = '#333840';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// A rounded-rectangle path, kept explicit rather than relying on ctx.roundRect
// so the export does not depend on how new the browser is.
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const sectionHeight = (section, cols, cardH) => {
  const rows = Math.ceil(section.items.length / cols);
  return HEADER_H + rows * cardH + (rows - 1) * ROW_GAP;
};

// A card is countable unless it is the single Legend or Chosen Champion, which
// are always one copy and so wear no ×count badge.
const isCounted = (section) => section.zone !== 'legend' && section.zone !== 'champion';

function drawCard(ctx, item, img, x, y, cardW, cardH, showCount) {
  roundRectPath(ctx, x, y, cardW, cardH, 12);
  ctx.save();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, cardW, cardH);
  } else {
    // A card id the database does not have, or art that failed to load: a plain
    // tile with the name so the copy is still accounted for.
    ctx.fillStyle = PLACEHOLDER_BG;
    ctx.fillRect(x, y, cardW, cardH);
    ctx.fillStyle = '#cfd3da';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = item.card?.name || item.cardId;
    ctx.fillText(label.slice(0, 22), x + cardW / 2, y + cardH / 2, cardW - 24);
  }
  ctx.restore();

  roundRectPath(ctx, x + 0.5, y + 0.5, cardW - 1, cardH - 1, 12);
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (showCount) {
    const text = `×${item.count}`;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(text).width;
    const padX = 12;
    const badgeW = tw + padX * 2;
    const badgeH = 34;
    const bx = x + cardW - badgeW - 10;
    const by = y + cardH - badgeH - 10;
    roundRectPath(ctx, bx, by, badgeW, badgeH, 8);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bx + padX, by + badgeH - 10);
  }
}

// One labelled section — header, "// count", divider, then its card grid — at
// (x0, y) laid out `cols` wide. Returns the height it took so the caller can
// stack the next one under it.
function drawSection(ctx, section, x0, y, cols, cardW, cardH, images) {
  const showCount = isCounted(section);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const labelText = section.label.toUpperCase();
  ctx.fillText(labelText, x0, y + 30);
  if (showCount) {
    const lw = ctx.measureText(labelText).width;
    ctx.fillStyle = ACCENT;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText(`// ${section.count}`, x0 + lw + 14, y + 30);
  }
  const contentW = cols * cardW + (cols - 1) * GAP;
  ctx.strokeStyle = DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + HEADER_H - 12);
  ctx.lineTo(x0 + contentW, y + HEADER_H - 12);
  ctx.stroke();

  section.items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = x0 + col * (cardW + GAP);
    const cy = y + HEADER_H + row * (cardH + ROW_GAP);
    drawCard(ctx, item, images.get(item.cardId), x, cy, cardW, cardH, showCount);
  });

  return sectionHeight(section, cols, cardH);
}

// The left column. Legend and Chosen Champion share the top row, one card each
// with its own header, then Battlefields and Runes stack below two cards wide.
// Passing draw=false measures the height without painting.
function layoutLeftColumn(ctx, byZone, x0, startY, cardW, cardH, images, draw) {
  let y = startY;
  const legend = byZone.legend;
  const champion = byZone.champion;
  if (legend || champion) {
    let rowH = 0;
    if (legend) {
      const h = draw
        ? drawSection(ctx, legend, x0, y, 1, cardW, cardH, images)
        : sectionHeight(legend, 1, cardH);
      rowH = Math.max(rowH, h);
    }
    if (champion) {
      const h = draw
        ? drawSection(ctx, champion, x0 + cardW + GAP, y, 1, cardW, cardH, images)
        : sectionHeight(champion, 1, cardH);
      rowH = Math.max(rowH, h);
    }
    y += rowH + SECTION_GAP;
  }
  for (const zone of ['battlefields', 'runes']) {
    const section = byZone[zone];
    if (!section) continue;
    const h = draw
      ? drawSection(ctx, section, x0, y, LEFT_COLS, cardW, cardH, images)
      : sectionHeight(section, LEFT_COLS, cardH);
    y += h + SECTION_GAP;
  }
  return y - startY;
}

// A plain vertical stack of sections at a fixed width, for the right column and
// for the single-column fallback. draw=false measures only.
function layoutStack(ctx, list, x0, startY, cols, cardW, cardH, images, draw) {
  let y = startY;
  for (const section of list) {
    const h = draw
      ? drawSection(ctx, section, x0, y, cols, cardW, cardH, images)
      : sectionHeight(section, cols, cardH);
    y += h + SECTION_GAP;
  }
  return y - startY;
}

// Paint the whole deck onto `canvas`, sizing it to fit. `images` maps a card id
// to its loaded Image (or null). Returns nothing; the caller reads the canvas.
function drawDeckImage(canvas, deckName, sections, images) {
  let aspect = FALLBACK_ASPECT;
  for (const img of images.values()) {
    if (img) {
      aspect = img.naturalHeight / img.naturalWidth;
      break;
    }
  }
  const cardW = CARD_W;
  const cardH = Math.round(cardW * aspect);

  const byZone = Object.fromEntries(sections.map((s) => [s.zone, s]));
  const leftSections = LEFT_ZONES.map((z) => byZone[z]).filter(Boolean);
  const rightSections = RIGHT_ZONES.map((z) => byZone[z]).filter(Boolean);
  const twoColumn = leftSections.length > 0 && rightSections.length > 0;

  // Column widths and the total content box. Without both sides, the one that
  // is present takes a single full-width column.
  const colWidth = (cols) => cols * cardW + (cols - 1) * GAP;
  const leftW = colWidth(LEFT_COLS);
  const rightW = colWidth(RIGHT_COLS);
  const contentW = twoColumn ? leftW + COLUMN_GUTTER + rightW : colWidth(FULL_COLS);
  const width = PAD * 2 + contentW;
  const bodyTop = PAD + TITLE_H;

  // Measure both columns to size the canvas to the taller one.
  let bodyH;
  if (twoColumn) {
    const lh = layoutLeftColumn(null, byZone, PAD, bodyTop, cardW, cardH, images, false);
    const rh = layoutStack(null, rightSections, 0, bodyTop, RIGHT_COLS, cardW, cardH, images, false);
    bodyH = Math.max(lh, rh);
  } else {
    const only = leftSections.length ? sections : rightSections;
    bodyH = layoutStack(null, only, 0, bodyTop, FULL_COLS, cardW, cardH, images, false);
  }
  // bodyH carries a trailing SECTION_GAP from the last section; swap it for PAD.
  const height = bodyTop + bodyH - SECTION_GAP + PAD;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Title and the gold rule under it.
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = '700 52px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(deckName || 'Untitled Deck', PAD, PAD + 58, contentW);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, PAD + 84, 96, 4);

  if (twoColumn) {
    layoutLeftColumn(ctx, byZone, PAD, bodyTop, cardW, cardH, images, true);
    const rightX = PAD + leftW + COLUMN_GUTTER;
    layoutStack(ctx, rightSections, rightX, bodyTop, RIGHT_COLS, cardW, cardH, images, true);
  } else {
    const only = leftSections.length ? sections : rightSections;
    layoutStack(ctx, only, PAD, bodyTop, FULL_COLS, cardW, cardH, images, true);
  }
}

function safeFileName(name) {
  return (name || 'deck').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'deck';
}

export default function DeckImageModal({ deck, cardsById, onClose }) {
  const canvasRef = useRef(null);
  // loading → the art is still coming in; ready → drawn; empty → nothing to draw.
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    const sections = deckImageSections(deck, cardsById);
    if (sections.length === 0) {
      setStatus('empty');
      return;
    }
    setStatus('loading');

    const ids = [...new Set(sections.flatMap((s) => s.items.map((i) => i.cardId)))];
    Promise.all(ids.map((id) => loadImage(cardsById.get(id)?.image))).then((imgs) => {
      if (cancelled) return;
      const images = new Map(ids.map((id, i) => [id, imgs[i]]));
      drawDeckImage(canvasRef.current, deck.name, sections, images);
      setStatus('ready');
    });

    return () => {
      cancelled = true;
    };
  }, [deck, cardsById]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFileName(deck.name)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <Modal title="Export image" onClose={onClose} className="wide deck-image-modal">
      {status === 'empty' ? (
        <p className="muted">This deck is empty — add some cards first.</p>
      ) : (
        <>
          <p className="muted">
            A single picture of the deck, cards in alphabetical order within each section.
            {status === 'loading' ? ' Loading card art…' : ''}
          </p>
          <div className="deck-image-preview">
            {/* Canvas is drawn at full resolution and scaled down by CSS; the
                download keeps the full-size pixels. */}
            <canvas ref={canvasRef} />
          </div>
        </>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Close</button>
        {status !== 'empty' && (
          <button className="primary" onClick={download} disabled={status !== 'ready'}>
            {status === 'ready' ? 'Download PNG' : 'Preparing…'}
          </button>
        )}
      </div>
    </Modal>
  );
}
