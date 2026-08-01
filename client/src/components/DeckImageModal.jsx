// Rules: docs/deck-builder.md
import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { deckImageSections } from '../lib/deck.js';

// The deck picture: a title, then the deck laid out in two columns like a deck
// list — the identity zones (Legend, Champion, Battlefields) in a narrow left
// column, the Main Deck filling the wide right one, and a bottom band under the
// Main Deck that carries the Runes and the Sideboard side by side, so nothing
// sits beside a wall of empty background. The whole thing is drawn onto a canvas
// so it exports as a single PNG. The DotGG CDN sends
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

// The Legend and the Chosen Champion are the identity of the deck, thus their
// cells are larger than a Main Deck cell. A battlefield cell is landscape and
// keeps a part of the width of its column.
const BIG_SCALE = 1.18;
const FIELD_SCALE = 0.75;

// The two columns: the left holds the identity zones two cards wide, the right
// the Main Deck six cards wide, with a gutter between them. The Runes and the
// Sideboard share one band under the Main Deck, in the same column, at BOTTOM_COLS
// cells each. A deck with no left zone falls back to a single full-width column.
const LEFT_COLS = 2;
const RIGHT_COLS = 6;
const FULL_COLS = LEFT_COLS + RIGHT_COLS;
const COLUMN_GUTTER = 48;
const BOTTOM_COLS = 4;
const LEFT_ZONES = ['legend', 'champion', 'battlefields'];
const BOTTOM_ZONES = ['runes', 'side'];

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
  const cellIsLandscape = cardW > cardH;
  const imgIsLandscape = !!img && img.naturalWidth > img.naturalHeight;
  if (img && item.card?.type === 'Battlefield' && imgIsLandscape !== cellIsLandscape) {
    // The CDN sends most battlefields landscape and four of them portrait, and
    // the battlefield cell is landscape while every other cell is portrait. A
    // quarter turn counter-clockwise makes a file match its cell, the same as
    // the DOM path in CardArt.jsx. The clip above holds the edges.
    ctx.translate(x + cardW / 2, y + cardH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -cardH / 2, -cardW / 2, cardH, cardW);
  } else if (img) {
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
// (x0, y) laid out `cols` wide. With `center`, each row sits in the middle of
// the column, so a part-filled last row does not hang to the left. Returns the
// height it took so the caller can stack the next one under it.
function drawSection(ctx, section, x0, y, cols, cardW, cardH, images, center) {
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

  const rows = Math.ceil(section.items.length / cols);
  section.items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    // The last row can hold fewer cards than the others, thus its own width sets
    // the offset when the grid is centred.
    const inRow = row === rows - 1 ? section.items.length - row * cols : cols;
    const rowW = inRow * cardW + (inRow - 1) * GAP;
    const rowX = center ? x0 + (contentW - rowW) / 2 : x0;
    const x = rowX + col * (cardW + GAP);
    const cy = y + HEADER_H + row * (cardH + ROW_GAP);
    drawCard(ctx, item, images.get(item.cardId), x, cy, cardW, cardH, showCount);
  });

  return sectionHeight(section, cols, cardH);
}

// The left column. Legend and Chosen Champion share the top row, one enlarged
// card each with its own header, then the Battlefields stack below, one on top
// of the other in a landscape cell a part of the width of the column. Passing
// draw=false measures the height without painting.
function layoutLeftColumn(ctx, byZone, x0, startY, metrics, images, draw) {
  const { bigW, bigH, fieldW, fieldH } = metrics;
  let y = startY;
  const legend = byZone.legend;
  const champion = byZone.champion;
  if (legend || champion) {
    let rowH = 0;
    if (legend) {
      const h = draw
        ? drawSection(ctx, legend, x0, y, 1, bigW, bigH, images)
        : sectionHeight(legend, 1, bigH);
      rowH = Math.max(rowH, h);
    }
    if (champion) {
      const h = draw
        ? drawSection(ctx, champion, x0 + bigW + GAP, y, 1, bigW, bigH, images)
        : sectionHeight(champion, 1, bigH);
      rowH = Math.max(rowH, h);
    }
    y += rowH + SECTION_GAP;
  }
  const fields = byZone.battlefields;
  if (fields) {
    // One per row: the cell is landscape, and drawCard turns the four portrait
    // battlefield files a quarter turn to match it.
    const h = draw
      ? drawSection(ctx, fields, x0, y, 1, fieldW, fieldH, images)
      : sectionHeight(fields, 1, fieldH);
    y += h + SECTION_GAP;
  }
  return y - startY;
}

// The bottom band: the Runes and the Sideboard beside each other under the Main
// Deck, in the same column. The cells are small so both zones fit on the one
// line. The cell size comes from a band of two slots either way, thus a deck
// with only one of the two zones keeps the same size and takes more columns.
// draw=false measures only. Returns the height of the taller slot.
function layoutBottomBand(ctx, list, x0, y, bandW, images, draw) {
  const slotW = (bandW - COLUMN_GUTTER * (list.length - 1)) / list.length;
  const twoSlotW = (bandW - COLUMN_GUTTER) / 2;
  const cardW = Math.floor((twoSlotW - GAP * (BOTTOM_COLS - 1)) / BOTTOM_COLS);
  const cardH = Math.round(cardW * FALLBACK_ASPECT);
  const cols = Math.max(1, Math.floor((slotW + GAP) / (cardW + GAP)));
  let h = 0;
  list.forEach((section, i) => {
    const x = x0 + i * (slotW + COLUMN_GUTTER);
    const sh = draw
      ? drawSection(ctx, section, x, y, cols, cardW, cardH, images)
      : sectionHeight(section, cols, cardH);
    h = Math.max(h, sh);
  });
  return h;
}

// Paint the whole deck onto `canvas`, sizing it to fit. `images` maps a card id
// to its loaded Image (or null). Returns nothing; the caller reads the canvas.
function drawDeckImage(canvas, deckName, sections, images) {
  // Every cell but a battlefield is portrait, and the ratio is fixed. The size
  // must not come from a loaded file: a battlefield file is landscape, and one
  // of them first in the map made all of the cells short and wide. drawCard
  // turns a file that does not match the shape of its cell.
  const cardW = CARD_W;
  const cardH = Math.round(cardW * FALLBACK_ASPECT);
  const bigW = Math.round(cardW * BIG_SCALE);
  const bigH = Math.round(bigW * FALLBACK_ASPECT);

  const byZone = Object.fromEntries(sections.map((s) => [s.zone, s]));
  const leftSections = LEFT_ZONES.map((z) => byZone[z]).filter(Boolean);
  const bottomSections = BOTTOM_ZONES.map((z) => byZone[z]).filter(Boolean);
  const main = byZone.main;
  const twoColumn = leftSections.length > 0;

  // Column widths and the total content box. The left column is two enlarged
  // cards wide, and a battlefield cell is a landscape cell across a part of it.
  const colWidth = (cols) => cols * cardW + (cols - 1) * GAP;
  const leftW = LEFT_COLS * bigW + (LEFT_COLS - 1) * GAP;
  const rightW = colWidth(RIGHT_COLS);
  const fieldW = Math.round(leftW * FIELD_SCALE);
  const metrics = {
    bigW,
    bigH,
    fieldW,
    fieldH: Math.round(fieldW / FALLBACK_ASPECT),
  };
  const contentW = twoColumn ? leftW + COLUMN_GUTTER + rightW : colWidth(FULL_COLS);
  const bandX = twoColumn ? PAD + leftW + COLUMN_GUTTER : PAD;
  const bandW = twoColumn ? rightW : contentW;
  const width = PAD * 2 + contentW;
  const bodyTop = PAD + TITLE_H;

  // Each column flows on its own: the Main Deck starts at the top of its column,
  // and the Runes and the Sideboard follow it in one band. Thus no grey band
  // opens above or under the Main Deck when the left column is the taller one.
  const mainCols = twoColumn ? RIGHT_COLS : FULL_COLS;
  const mainH = main ? sectionHeight(main, mainCols, cardH) : 0;
  const leftH = twoColumn
    ? layoutLeftColumn(null, byZone, PAD, bodyTop, metrics, images, false) - SECTION_GAP
    : 0;
  const mainY = bodyTop;
  const bandY = bodyTop + mainH + (main && bottomSections.length ? SECTION_GAP : 0);
  const bandH = bottomSections.length
    ? layoutBottomBand(null, bottomSections, bandX, bandY, bandW, images, false)
    : 0;
  // The canvas takes the taller of the two columns.
  const height = Math.max(bodyTop + leftH, bandY + bandH) + PAD;

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

  if (twoColumn) layoutLeftColumn(ctx, byZone, PAD, bodyTop, metrics, images, true);
  if (main) drawSection(ctx, main, bandX, mainY, mainCols, cardW, cardH, images, true);
  if (bottomSections.length) {
    layoutBottomBand(ctx, bottomSections, bandX, bandY, bandW, images, true);
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
