// Rules: docs/libraries.md
import { ownedCopies, routeFinish } from './cards.js';

// Rapid entry: one person reads collector numbers aloud, the other types them
// against a fixed set. Everything the dialog needs to turn a typed token into a
// collection delta lives here so the component stays presentational, the same
// split importExport.js has with ImportDialog.
//
// Grammar (modifiers may appear in any order after the number):
//   3      +1 normal copy of SET-003
//   3+     +1 foil copy
//   3p     +1 copy of the promo printing
//   3a     +1 copy of the alternative-art printing (SET-003a, also the runes:
//          r01a is SET-R01a). b reaches the second alternative art (SET-003b).
//   3*     +1 copy of the signature printing (the -STAR overnumber, SET-003-STAR)
//   10x3   +3 copies
//   -3     -1 copy

const CORE = /^(r\d{1,2}|t\d{1,2}|\d{1,3})/;

export function parseRapidToken(raw) {
  const text = String(raw || '')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!text) return { error: 'Type a card number' };

  const sign = text.startsWith('-') ? -1 : 1;
  const body = sign === -1 ? text.slice(1) : text;

  const core = body.match(CORE);
  if (!core) return { error: `Not a card number: ${raw}` };

  let rest = body.slice(core[0].length);
  let foil = false;
  let promo = false;
  let variant = null;
  let times = 1;

  while (rest) {
    if (rest[0] === '+') {
      foil = true;
      rest = rest.slice(1);
    } else if (rest[0] === 'p') {
      promo = true;
      rest = rest.slice(1);
    } else if (rest[0] === 'a' || rest[0] === 'b') {
      variant = rest[0];
      rest = rest.slice(1);
    } else if (rest[0] === '*') {
      variant = 'star';
      rest = rest.slice(1);
    } else {
      const mult = rest.match(/^x(\d{1,3})/);
      if (!mult) return { error: `Don't understand "${rest}" in ${raw}` };
      times = Number(mult[1]);
      if (times < 1) return { error: 'Multiplier must be at least 1' };
      rest = rest.slice(mult[0].length);
    }
  }

  return { sign, core: core[0], foil, promo, variant, times };
}

// Collector numbers are zero-padded inside the id, the same rule the TCGplayer
// importer applies in collectorFromNumber. Runes are the trap: Origins numbers
// them plainly (Fury Rune is OGN-007), while SFD/UNL/VEN use an R prefix
// (SFD-R01). So "r1" only resolves outside Origins, and "7" under OGN is a
// legitimate way to reach the Fury Rune.
export function normalizeCore(core) {
  const prefix = core[0];
  if (prefix === 'r' || prefix === 't') {
    return prefix.toUpperCase() + core.slice(1).padStart(2, '0');
  }
  return core.padStart(3, '0');
}

const NUMERIC_BASE = /^(R?\d+)/i;

// Promo printings do not share one id shape — 108 use "-P" but the rest use a
// trailing letter, "-P2", "/298" or no suffix at all — so they are found by
// grouping every printing under its numeric base rather than by pattern.
export function buildPromoIndex(cards) {
  const index = new Map();
  for (const card of cards) {
    if (!card.promo) continue;
    const base = card.id.slice(card.setCode.length + 1).match(NUMERIC_BASE);
    if (!base) continue;
    const key = `${card.setCode}-${base[1].toUpperCase()}`;
    const list = index.get(key);
    if (list) list.push(card);
    else index.set(key, [card]);
  }
  return index;
}

// 12 collector numbers carry more than one promo printing (SFD-178, OGN-193,
// UNL-058 …). The plain "-P" form wins, then the lowest id. The history row
// always shows the resolved id, so an ambiguous pick stays visible.
function pickPromo(list, baseId) {
  const exact = list.find((c) => c.id === `${baseId}-P`);
  if (exact) return exact;
  return [...list].sort((a, b) => a.id.localeCompare(b.id))[0];
}

/**
 * Turn a typed token into a single collection delta.
 *
 * @param {string} setCode  the set chosen in the dropdown
 * @param {string} raw      what was typed
 * @param {object} ctx      { cardsById, promoIndex, ownedOf } — ownedOf(cardId, kind)
 *                          returns the copies already committed plus this session's
 *                          net, so a removal can be rejected before it ever reaches
 *                          the store.
 * @returns {{card, kind, delta, autoFinish}|{error: string}}
 */
export function resolveRapidEntry(setCode, raw, { cardsById, promoIndex, ownedOf }) {
  const parsed = parseRapidToken(raw);
  if (parsed.error) return parsed;

  const baseId = `${setCode}-${normalizeCore(parsed.core)}`;

  let card;
  if (parsed.promo) {
    const list = promoIndex.get(baseId.toUpperCase());
    if (!list || list.length === 0) return { error: `${baseId} has no promo printing` };
    card = pickPromo(list, baseId);
  } else if (parsed.variant === 'star') {
    // Signature cards are overnumbered and carry a -STAR suffix (SFD-227-STAR).
    card = cardsById.get(`${baseId}-STAR`);
    if (!card) return { error: `No card ${baseId}-STAR` };
  } else if (parsed.variant) {
    // Alternative-art printings add a trailing a/b, but the sets disagree on the
    // case (OGN-066a is lower, VEN-021A is upper), so try the typed case first.
    card =
      cardsById.get(baseId + parsed.variant) ||
      cardsById.get(baseId + parsed.variant.toUpperCase());
    if (!card) return { error: `No card ${baseId}${parsed.variant}` };
  } else {
    card = cardsById.get(baseId);
    if (!card) return { error: `No card ${baseId}` };
  }

  // Route to the finish the printing actually has (see routeFinish) and flag the
  // swap so the history row shows it rather than silently recording something
  // else than what was typed.
  const typed = parsed.foil ? 'foil' : 'normal';
  const kind = routeFinish(card, typed);
  const autoFinish = kind !== typed;

  const delta = parsed.sign * parsed.times;
  if (delta < 0 && ownedOf(card.id, kind) + delta < 0) {
    return { error: `Nothing to remove — no ${kind} ${card.id}` };
  }

  return { card, kind, delta, autoFinish };
}

// Fold a session's entries into the { cardId: { normal, foil } } shape
// mergeCollection takes. Cards whose net comes back to zero drop out.
export function sessionTotals(entries) {
  const totals = new Map();
  for (const e of entries) {
    const acc = totals.get(e.cardId) || { normal: 0, foil: 0 };
    acc[e.kind] += e.delta;
    totals.set(e.cardId, acc);
  }
  for (const [id, acc] of totals) {
    if (acc.normal === 0 && acc.foil === 0) totals.delete(id);
  }
  return totals;
}

// Value of the copies added this session. Prices each finish at its own rate
// (normal at price, foil at foilPrice) rather than through effectivePrice, which
// is what the collection stats panel does, so the two numbers reconcile.
export function sessionValue(totals, cardsById) {
  let value = 0;
  for (const [id, acc] of totals) {
    const card = cardsById.get(id);
    if (!card) continue;
    value += acc.normal * (card.price || 0) + acc.foil * (card.foilPrice || 0);
  }
  return value;
}

// Copies already in the collection for one printing and finish.
export function committedCopies(collection, cardId, kind) {
  return ownedCopies(collection[cardId])[kind];
}
