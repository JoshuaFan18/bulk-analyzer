// Rules: docs/libraries.md (deck model) and docs/deck-builder.md (legality)
import {
  cardIdentity,
  championMatchesLegend,
  dedupeByIdentity,
  effectivePrice,
  isBasePrinting,
  isChampionUnit,
  isToken,
  signatureAllowed,
  withinLegendDomains,
} from './cards.js';

export const ZONES = {
  battlefields: { label: 'Battlefields', max: 3 },
  runes: { label: 'Runes', max: 12 },
  main: { label: 'Main Deck', max: 40 },
  side: { label: 'Sideboard', max: 10 },
  bench: { label: 'The Bench', max: null },
};

export const MAX_COPIES_MAIN = 3;

// Main-deck grouping by type, shared by the deck builder and the deck viewer.
// The trailing bucket catches anything an imported deck put in the main zone
// that is not one of the three normal types, so nothing is silently missing.
export const MAIN_TYPES = ['Unit', 'Spell', 'Gear'];
export const MAIN_GROUPS = [
  { label: 'Units', types: ['Unit'] },
  { label: 'Spells', types: ['Spell'] },
  { label: 'Gear', types: ['Gear'] },
  { label: 'Other', types: null },
];

// True when the card belongs in the given MAIN_GROUPS bucket.
export function inMainGroup(card, types) {
  return types ? types.includes(card?.type) : !MAIN_TYPES.includes(card?.type);
}

// Signature cards are capped at 3 cumulatively across the deck, counting
// different signature names together rather than 3 of each.
export const MAX_SIGNATURE_CARDS = 3;

// The most copies of one card a single deck can hold — what the Surplus report
// measures ownership against. NOT interchangeable with playsetTarget, which
// answers a different question (set completion) and returns 0 for Runes; using
// it here would report every owned rune as surplus. It lives in deck.js rather
// than cards.js because it is a deck rule and cards.js cannot import from here
// without a cycle.
export function deckCopyLimit(card) {
  if (isToken(card)) return Infinity;
  if (card.type === 'Rune') return ZONES.runes.max;
  if (card.type === 'Legend' || card.type === 'Battlefield') return 1;
  return MAX_COPIES_MAIN;
}

export function signatureCount(deck, cardsById) {
  if (!cardsById) return 0;
  let n = 0;
  for (const { cardId, count, zone } of deckEntries(deck)) {
    if (zone === 'bench' || zone === 'legend') continue;
    if (cardsById.get(cardId)?.supertype === 'Signature') n += count;
  }
  return n;
}

export function emptyDeck() {
  return {
    name: 'Untitled Deck',
    legend: null,
    champion: null,
    battlefields: {},
    runes: {},
    main: {},
    side: {},
    bench: {},
  };
}

export function zoneCount(zone) {
  return Object.values(zone || {}).reduce((s, n) => s + n, 0);
}

// The Chosen Champion is one of the 40 cards, so the main deck holds 39
// alongside it. It stays in its own field rather than inside deck.main, so the
// deck file shape is unchanged.
export function mainTarget(deck) {
  return ZONES.main.max - (deck.champion ? 1 : 0);
}

// The main deck plus the champion, which is what the 40-card limit counts.
export function mainWithChampion(deck) {
  return zoneCount(deck.main) + (deck.champion ? 1 : 0);
}

// Which zone a card goes to when "Add to" is set to Auto
export function autoZone(card, deck, cardsById) {
  if (card.type === 'Legend') return 'legend';
  if (card.type === 'Battlefield') return 'battlefields';
  if (card.type === 'Rune') return 'runes';
  // Only the legend's own champion auto-fills the slot; every other champion
  // unit is an ordinary main-deck card.
  if (isChampionUnit(card) && !deck.champion) {
    const legendCard = deck.legend ? cardsById?.get(deck.legend) : null;
    if (championMatchesLegend(card, legendCard)) return 'champion';
  }
  return 'main';
}

export function addCard(deck, card, target, cardsById) {
  const zone = target === 'auto' ? autoZone(card, deck, cardsById) : target;
  const next = { ...deck };
  if (zone === 'legend') {
    next.legend = card.id;
    return next;
  }
  if (zone === 'champion') {
    const legendCard = deck.legend ? cardsById?.get(deck.legend) : null;
    if (!championMatchesLegend(card, legendCard)) return deck;
    next.champion = card.id;
    return next;
  }
  const z = { ...next[zone] };
  const current = z[card.id] || 0;
  if (zone === 'main' && current >= MAX_COPIES_MAIN) return deck;
  if (
    card.supertype === 'Signature' &&
    zone !== 'bench' &&
    signatureCount(deck, cardsById) >= MAX_SIGNATURE_CARDS
  ) {
    return deck;
  }
  const max = zone === 'main' ? mainTarget(deck) : ZONES[zone].max;
  if (max != null && zoneCount(z) >= max) return deck;
  z[card.id] = current + 1;
  next[zone] = z;
  return next;
}

export function removeCard(deck, cardId, zone) {
  const next = { ...deck };
  if (zone === 'legend') {
    next.legend = null;
    return next;
  }
  if (zone === 'champion') {
    next.champion = null;
    return next;
  }
  const z = { ...next[zone] };
  if (!z[cardId]) return deck;
  z[cardId] -= 1;
  if (z[cardId] <= 0) delete z[cardId];
  next[zone] = z;
  return next;
}

// The zones one copy can be promoted or demoted through, worst to best:
// the bench holds cards you are considering, the sideboard cards you may swap
// in, the main deck what you actually play. Battlefields and Runes are outside
// the ladder — a rune has nowhere else it could legally go.
export const ZONE_LADDER = ['bench', 'side', 'main'];

// Move a single copy one step along the ladder (+1 up, -1 down). Returns the
// deck unchanged when there is no next zone or the destination is full, so a
// blocked move never destroys the copy it was carrying.
export function moveCard(deck, cardId, fromZone, dir, cardsById) {
  const from = ZONE_LADDER.indexOf(fromZone);
  const to = ZONE_LADDER[from + dir];
  if (from === -1 || !to) return deck;
  if (!deck[fromZone]?.[cardId]) return deck;
  const card = cardsById?.get(cardId);
  if (!card) return deck;
  // Removed first so the destination's limit check counts the copy as having
  // already left the source: without that, the 3rd copy of a card could never
  // be moved down and back up.
  const without = removeCard(deck, cardId, fromZone);
  const moved = addCard(without, card, to, cardsById);
  // addCard returns its input untouched when a limit blocks the add.
  return moved === without ? deck : moved;
}

// Whether that move would do anything, for disabling the arrow rather than
// offering a button that silently does nothing.
export function canMoveCard(deck, cardId, fromZone, dir, cardsById) {
  return moveCard(deck, cardId, fromZone, dir, cardsById) !== deck;
}

// Every (cardId, count, zone) entry of a deck, legend and champion included
export function deckEntries(deck) {
  const out = [];
  if (deck.legend) out.push({ cardId: deck.legend, count: 1, zone: 'legend' });
  if (deck.champion) out.push({ cardId: deck.champion, count: 1, zone: 'champion' });
  for (const zone of Object.keys(ZONES)) {
    for (const [cardId, count] of Object.entries(deck[zone] || {})) {
      out.push({ cardId, count, zone });
    }
  }
  return out;
}

// Which decks each printing appears in, for the collection page's [In Deck]
// chip. Keyed on the exact card id rather than cardIdentity, because the chip
// means "this physical card is committed to a deck" — an alt-art copy sitting
// in a box is not.
export function buildInDeckIndex(decks) {
  const index = new Map();
  for (const deck of decks || []) {
    const name = deck.name || 'Untitled Deck';
    const seen = new Set();
    for (const { cardId } of deckEntries(deck)) {
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const list = index.get(cardId) || [];
      list.push(name);
      index.set(cardId, list);
    }
  }
  return index;
}

export function deckValidation(deck, cardsById) {
  const problems = [];
  if (!deck.legend) problems.push('No Legend selected');
  if (!deck.champion) problems.push('No Chosen Champion selected');
  const bf = zoneCount(deck.battlefields);
  if (bf !== 3) problems.push(`Battlefields: ${bf}/3`);
  const runes = zoneCount(deck.runes);
  if (runes !== 12) problems.push(`Runes: ${runes}/12`);
  const main = zoneCount(deck.main);
  const target = mainTarget(deck);
  if (main !== target) {
    problems.push(
      deck.champion
        ? `Main deck: ${main}/${target} (${main + 1}/${ZONES.main.max} with the champion)`
        : `Main deck: ${main}/${target}`
    );
  }
  const side = zoneCount(deck.side);
  if (side > 10) problems.push(`Sideboard over limit: ${side}/10`);

  if (!cardsById) return problems;

  // Banned status is independent of the legend, so it is checked even before
  // one is chosen.
  const banned = new Set();
  for (const { cardId, zone } of deckEntries(deck)) {
    if (zone === 'bench') continue;
    const card = cardsById.get(cardId);
    if (card?.banned) banned.add(card.name);
  }
  if (banned.size > 0) {
    problems.push(`Banned: ${[...banned].join(', ')}`);
  }

  // Importing a deck or swapping the legend can strand cards that were legal
  // when they were added.
  if (deck.legend) {
    const legendCard = cardsById.get(deck.legend);

    // Swapping the legend or importing a deck can leave a champion that does
    // not belong to it. Flagged rather than cleared, so the pick is not thrown
    // away silently.
    const championCard = deck.champion ? cardsById.get(deck.champion) : null;
    if (championCard && !championMatchesLegend(championCard, legendCard)) {
      problems.push(`${championCard.name} is not ${legendCard?.name || 'this legend'}'s champion`);
    }

    const wrongChampion = new Set();
    const offDomain = new Set();
    for (const { cardId, zone } of deckEntries(deck)) {
      if (zone === 'bench' || zone === 'legend') continue;
      const card = cardsById.get(cardId);
      if (!card) continue;
      if (!signatureAllowed(card, legendCard)) wrongChampion.add(card.name);
      else if (!withinLegendDomains(card, legendCard)) offDomain.add(card.name);
    }
    for (const name of wrongChampion) {
      problems.push(`${name} is another champion's signature card`);
    }
    if (offDomain.size > 0) {
      const domains = (legendCard?.colors || []).join('/');
      problems.push(
        `Outside your ${domains} domains: ${[...offDomain].slice(0, 4).join(', ')}${
          offDomain.size > 4 ? ` and ${offDomain.size - 4} more` : ''
        }`
      );
    }

    const sigs = signatureCount(deck, cardsById);
    if (sigs > MAX_SIGNATURE_CARDS) {
      problems.push(`Signature cards: ${sigs}/${MAX_SIGNATURE_CARDS}`);
    }
  }
  return problems;
}

export function deckPrice(deck, cardsById) {
  let total = 0;
  for (const { cardId, count, zone } of deckEntries(deck)) {
    if (zone === 'bench') continue;
    const card = cardsById.get(cardId);
    if (!card) continue;
    total += (effectivePrice(card) || 0) * count;
  }
  return total;
}

export function deckColors(deck, cardsById) {
  const colors = new Set();
  for (const { cardId, zone } of deckEntries(deck)) {
    if (zone === 'bench' || zone === 'side') continue;
    const card = cardsById.get(cardId);
    for (const c of card?.colors || []) {
      if (c !== 'Colorless') colors.add(c);
    }
  }
  return [...colors];
}

const SECTION_TO_ZONE = {
  legend: 'legend',
  champion: 'champion',
  battlefields: 'battlefields',
  battlefield: 'battlefields',
  runes: 'runes',
  rune: 'runes',
  main: 'main',
  maindeck: 'main',
  sideboard: 'side',
  side: 'side',
  bench: 'bench',
};

// Section order used by the text format. "MainDeck" collapses to "maindeck"
// through SECTION_TO_ZONE, so the header spelling here and the one the parser
// accepts stay in sync.
const EXPORT_SECTIONS = [
  ['Legend', 'legend'],
  ['Champion', 'champion'],
  ['MainDeck', 'main'],
  ['Battlefields', 'battlefields'],
  ['Runes', 'runes'],
  ['Sideboard', 'side'],
  ['Bench', 'bench'],
];

// Plain-text deck format: bare "Section:" headers and "<count> <Card Name>"
// lines, blank line between sections, empty sections omitted.
export function exportDeckText(deck, cardsById) {
  const blocks = [];
  for (const [label, zone] of EXPORT_SECTIONS) {
    let entries;
    if (zone === 'legend') entries = deck.legend ? [[deck.legend, 1]] : [];
    else if (zone === 'champion') entries = deck.champion ? [[deck.champion, 1]] : [];
    else entries = Object.entries(deck[zone] || {});
    if (entries.length === 0) continue;
    const lines = [`${label}:`];
    const named = entries
      .map(([id, count]) => ({ count, name: cardsById.get(id)?.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const { count, name } of named) lines.push(`${count} ${name}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

// Zones in the order a visual deck layout shows them, with the label each one
// wears. The single-card zones lead, then the main deck and the rest. The bench
// is left out: it is the "considering" pile, not part of the deck the picture
// presents.
const IMAGE_SECTIONS = [
  ['Legend', 'legend'],
  ['Champion', 'champion'],
  ['Main Deck', 'main'],
  ['Battlefields', 'battlefields'],
  ['Runes', 'runes'],
  ['Sideboard', 'side'],
];

// The deck as ordered sections for the image export: one entry per non-empty
// zone, each `{ label, zone, count, items }` where `count` is the copies in the
// zone and `items` is `{ cardId, count, card }` sorted alphabetically by name.
// A card id the database does not have keeps its row (card is null), so an
// imported deck never loses a line in the picture.
export function deckImageSections(deck, cardsById) {
  const sections = [];
  for (const [label, zone] of IMAGE_SECTIONS) {
    let entries;
    if (zone === 'legend') entries = deck.legend ? [[deck.legend, 1]] : [];
    else if (zone === 'champion') entries = deck.champion ? [[deck.champion, 1]] : [];
    else entries = Object.entries(deck[zone] || {});
    if (entries.length === 0) continue;
    const items = entries
      .map(([cardId, count]) => ({ cardId, count, card: cardsById?.get(cardId) || null }))
      .sort((a, b) => (a.card?.name || a.cardId).localeCompare(b.card?.name || b.cardId));
    const count = items.reduce((s, i) => s + i.count, 0);
    sections.push({ label, zone, count, items });
  }
  return sections;
}

// Name lookup for imports. Built from deduped base printings so a name with
// several printings (the six runes) always resolves to the same canonical card,
// and so an import never lands on a promo or alt art.
function buildImportIndex(cardsById) {
  const all = [...cardsById.values()];
  const byIdentity = new Map();
  for (const card of dedupeByIdentity(all.filter((c) => !isToken(c) && isBasePrinting(c)))) {
    byIdentity.set(cardIdentity(card), card);
  }
  // Anything only ever printed as a promo still needs to resolve, but must not
  // displace a base printing.
  for (const card of all) {
    const key = cardIdentity(card);
    if (!byIdentity.has(key)) byIdentity.set(key, card);
  }
  const byUpperId = new Map();
  for (const card of all) byUpperId.set(card.id.toUpperCase(), card);
  return { byIdentity, byUpperId };
}

// Plain-text deck format, matching what riftbound deck sites emit:
//
//   Legend:
//   1 Irelia, Blade Dancer
//
//   MainDeck:
//   3 Defiant Dance
//
// Card ids are still accepted on a line so decks exported before the format
// changed keep importing. Lines starting with # are comments, and the first one
// names the deck.
export function parseDeckText(text, cardsById) {
  const deck = emptyDeck();
  const unmatched = [];
  let zone = 'main';
  let sawNameComment = false;
  let matched = 0;
  const { byIdentity, byUpperId } = buildImportIndex(cardsById);

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      if (!sawNameComment) {
        deck.name = trimmed.replace(/^#+\s*/, '') || deck.name;
        sawNameComment = true;
      }
      continue;
    }
    const line = trimmed.split('#')[0].trim();
    if (!line) continue;
    const section = line.match(/^([A-Za-z][A-Za-z ]*):\s*$/);
    if (section) {
      const z = SECTION_TO_ZONE[section[1].toLowerCase().replace(/[^a-z]/g, '')];
      if (z) zone = z;
      else unmatched.push(rawLine);
      continue;
    }
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (!m) {
      unmatched.push(rawLine);
      continue;
    }
    const count = parseInt(m[1], 10);
    const label = m[2].trim();
    const card =
      byIdentity.get(cardIdentity({ name: label })) || byUpperId.get(label.toUpperCase());
    if (!card || !count) {
      unmatched.push(rawLine);
      continue;
    }
    matched += 1;
    if (zone === 'legend') deck.legend = card.id;
    else if (zone === 'champion') deck.champion = card.id;
    else deck[zone] = { ...deck[zone], [card.id]: (deck[zone][card.id] || 0) + count };
  }
  return { deck, unmatched, matched };
}
