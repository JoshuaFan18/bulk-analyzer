export const COLORS = ['Fury', 'Calm', 'Mind', 'Body', 'Order', 'Chaos', 'Colorless'];

export const COLOR_HEX = {
  Fury: '#e05252',
  Calm: '#3ec6a8',
  Mind: '#4f8fe6',
  Body: '#e0913d',
  Order: '#e6cf6b',
  Chaos: '#a66be6',
  Colorless: '#9aa4b2',
};

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
export const CARD_TYPES = ['Unit', 'Spell', 'Gear', 'Battlefield', 'Rune', 'Legend'];
export const SUPERTYPES = ['Champion', 'Signature', 'Token', 'Basic'];

// TCGplayer / riftbound.gg set name -> set code
export const SET_CODE_BY_NAME = {
  origins: 'OGN',
  'origins starter': 'OGS',
  'proving grounds': 'OGS',
  'origins proving grounds': 'OGS',
  spiritforged: 'SFD',
  unleashed: 'UNL',
  vendetta: 'VEN',
  'arcane box set': 'ARC',
};

// Display name per set code. The API's set_name is not consistent within a set
// -- the four oversized Origins battlefield promos (OGN-279/298 and friends)
// carry "Origins Proving Grounds", which grouping on set_name turns into a
// phantom extra set. Always label a set from its code, never from set_name.
export const SET_NAME_BY_CODE = {
  OGN: 'Origins',
  OGS: 'Proving Grounds',
  SFD: 'Spiritforged',
  UNL: 'Unleashed',
  VEN: 'Vendetta',
  ARC: 'Arcane Box Set',
};

export function setLabel(card) {
  return SET_NAME_BY_CODE[card.setCode] || card.setName || card.setCode;
}

// Release order, oldest first. Used to pick which printing of a card is the
// canonical one; unknown (future) set codes sort last so a new set never
// silently takes over from an existing printing.
export const SET_RELEASE_ORDER = ['OGN', 'OGS', 'SFD', 'UNL', 'VEN', 'ARC'];

// metagame_id on riftdecks.com. Shared by the Config page (which refreshes the
// meta-cache) and the Bulk Analyzer (which only reads it).
export const METAGAME_PRESETS = [
  { id: '1', label: 'Origins (1)' },
  { id: '2', label: 'Spiritforged (2)' },
  { id: '3', label: 'Unleashed (3)' },
  { id: '4', label: 'Vendetta (4)' },
];

// Release position of a set code. An unknown (future) code sorts LAST, which a
// bare indexOf would get backwards.
export function setRank(code) {
  const i = SET_RELEASE_ORDER.indexOf(code);
  return i === -1 ? SET_RELEASE_ORDER.length : i;
}

// The [code, label] pairs behind every set control, built from the cards that
// actually exist rather than from SET_NAME_BY_CODE, so a code the pool never
// produced is never offered.
export function setNameOptions(cards) {
  const seen = new Map();
  for (const c of cards) if (!seen.has(c.setCode)) seen.set(c.setCode, setLabel(c));
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isToken(card) {
  return card.supertype === 'Token' || card.type === '';
}

// Base printings carry a plain collector number, with runes using an R-prefix
// (SFD-R01). Every other id shape is a reprint: -P promos, -STAR/-SP variants,
// and trailing-letter alternate arts (OGN-039a, UNL-024A). A few plain-numbered
// cards are alternate-art reprints in a later set (SFD-227), which the rarity
// check catches.
const BASE_PRINTING_ID = /^[A-Z]{2,4}-R?\d+$/;

export function isBasePrinting(card) {
  return !card.promo && card.rarity !== 'Showcase' && BASE_PRINTING_ID.test(card.id);
}

const PAREN_SUFFIX = /\s*\([\s\S]*\)\s*$/;

// Every printing of a card shares this key, so alt-art and promo copies count
// toward the base printing. Printings vary only cosmetically in name
// ("Darius, Hand of Noxus" vs "Darius - Hand of Noxus"), and normName drops
// punctuation, so both forms collapse together.
export function cardIdentity(card) {
  return normName(card.name.replace(PAREN_SUFFIX, ''));
}

// One entry per distinct card, keeping the earliest printing. isBasePrinting
// already drops promos and alt arts, but the six runes are each reprinted as a
// plain base printing in all four sets (Calm Rune is OGN-042, SFD-R02, UNL-R02
// and VEN-R02), which is why the deck builder pool otherwise shows 24 runes.
// They are the only duplicated names among the 946 base printings, so this is a
// no-op for everything else. The collection manager must NOT use this — it
// tracks each printing separately on purpose.
export function dedupeByIdentity(cards) {
  const best = new Map();
  for (const card of cards) {
    const key = cardIdentity(card);
    const current = best.get(key);
    if (!current) {
      best.set(key, card);
      continue;
    }
    const rank = setRank(card.setCode) - setRank(current.setCode);
    if (rank < 0 || (rank === 0 && card.id.localeCompare(current.id) < 0)) best.set(key, card);
  }
  return [...best.values()];
}

// The champion a legend belongs to, read off the name prefix
// ("Kai'Sa - Daughter of the Void" -> "Kai'Sa"). Promo legends separate with a
// comma instead of a dash, so both count as the split point.
export function championOf(card) {
  return card.name
    .replace(PAREN_SUFFIX, '')
    .split(/\s+[-,]\s+/)[0]
    .trim();
}

// A signature card is only legal alongside its own champion's legend. Matching
// on the legend's champion name rather than any shared tag matters because
// legends also carry region tags (Yordle) that signature cards can share.
export function signatureAllowed(card, legendCard) {
  if (card.supertype !== 'Signature' || !legendCard) return true;
  return (card.tags || []).includes(championOf(legendCard));
}

// A Chosen Champion candidate. The type check is load-bearing: nine legends
// (OGN-255, OGS-017, OGN-247, …) also carry supertype Champion, and would
// otherwise qualify to fill the champion slot.
export function isChampionUnit(card) {
  return card.type === 'Unit' && card.supertype === 'Champion';
}

// The Chosen Champion has to be the legend's own champion. Matched on the tag
// the champion units carry ("Ahri") against the legend's name prefix, the same
// pairing signatureAllowed uses.
export function championMatchesLegend(card, legendCard) {
  if (!isChampionUnit(card) || !legendCard) return false;
  return (card.tags || []).includes(championOf(legendCard));
}

// A deck's domain identity comes from its legend, and runes and main-deck
// cards must sit inside it. Colorless cards and battlefields are always legal,
// and legends stay legal so the legend itself can be swapped.
export function withinLegendDomains(card, legendCard) {
  if (!legendCard || card.type === 'Battlefield' || card.type === 'Legend') return true;
  const domains = new Set((legendCard.colors || []).filter((c) => c !== 'Colorless'));
  return (card.colors || []).every((c) => c === 'Colorless' || domains.has(c));
}

const NO_COPIES = { normal: 0, foil: 0, total: 0 };

// Owned counts summed across every printing of each card.
export function buildOwnedIndex(cards, collection) {
  const index = new Map();
  for (const card of cards) {
    const entry = collection[card.id];
    if (!entry) continue;
    const key = cardIdentity(card);
    const acc = index.get(key) || { normal: 0, foil: 0, total: 0 };
    acc.normal += entry.normal || 0;
    acc.foil += entry.foil || 0;
    acc.total = acc.normal + acc.foil;
    index.set(key, acc);
  }
  return index;
}

export function ownedAcrossPrintings(card, ownedIndex) {
  if (!card) return NO_COPIES;
  return ownedIndex?.get(cardIdentity(card)) || NO_COPIES;
}

// Keywords are not a field — they live in the effect text as bracket tokens,
// sometimes carrying a value ("[Shield 2]"), which is dropped so the keyword
// itself is what gets matched.
const KEYWORD_TOKEN = /\[([A-Z][A-Za-z' -]*?)(?: \d+)?\]/g;
const NON_KEYWORDS = new Set(['NO TEXT']);

export function cardKeywords(card) {
  const found = new Set();
  for (const [, word] of (card.effect || '').matchAll(KEYWORD_TOKEN)) {
    if (!NON_KEYWORDS.has(word)) found.add(word);
  }
  return found;
}

export function buildKeywordIndex(cards) {
  const byCard = new Map();
  const counts = new Map();
  for (const card of cards) {
    const words = cardKeywords(card);
    byCard.set(card.id, words);
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return {
    byCard,
    all: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

// Buckets for the Energy filter -- card.cost, the generic cost the DotGG feed
// carries. Every consumer (the two filter surfaces, the pool's per-option counts
// and the deck stats curve) reads these three exports, so an option can never
// sit next to a count computed from a different bucketing.
export const ENERGY_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

export function energyBucket(card) {
  if (card.cost == null) return null;
  return card.cost >= 7 ? '7+' : String(card.cost);
}

export function matchesCost(card, bucket) {
  if (bucket === 'any') return true;
  return energyBucket(card) === bucket;
}

// Buckets for the Might filter. Might tops out at 12 but thins out fast, so
// the tail is grouped.
export const MIGHT_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9+'];

export function mightBucket(card) {
  if (card.might == null) return null;
  return card.might >= 9 ? '9+' : String(card.might);
}

export function matchesMight(card, bucket) {
  if (bucket === 'any') return true;
  return mightBucket(card) === bucket;
}

// Buckets for the Power filter -- the COLORED cost, not card.cost (energy).
// Power tops out at 4 in the data, so "3+" covers 3 and 4.
export const POWER_BUCKETS = ['0', '1', '2', '3+'];

export function powerBucket(card) {
  if (card.power == null) return null;
  return card.power >= 3 ? '3+' : String(card.power);
}

// Shared by the deck builder and the collection page so the two cannot drift.
// Like matchesMight, a null stat is excluded rather than read as 0: the 311
// cards with no power concept (legends, battlefields, runes, tokens) must not
// answer to the "0" bucket, which 542 real zero-power cards already own. The
// bucket helpers return null for that case, and null never equals a bucket name.
export function matchesPower(card, bucket) {
  if (bucket === 'any') return true;
  return powerBucket(card) === bucket;
}

// Type and supertype are two independent questions and get a control each, so
// they compose: "Unit" + "Champion" is the champion units, not one or the other.
export function matchesType(card, value) {
  if (value === 'any') return true;
  return card.type === value;
}

// Token is not plain supertype equality -- isToken also counts the typeless
// cards, and dropping that would silently change which cards match.
export function matchesSupertype(card, value) {
  if (value === 'any') return true;
  if (value === 'Token') return isToken(card);
  return card.supertype === value;
}

export function cardMatchesText(card, text) {
  if (!text) return true;
  const q = text.toLowerCase();
  return (
    card.name.toLowerCase().includes(q) ||
    card.id.toLowerCase().includes(q) ||
    (card.effect || '').toLowerCase().includes(q)
  );
}

export function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${Number(n).toFixed(2)}`;
}

// The price a single copy actually sells for. Foil-only cards carry their
// value in foilPrice and report price 0, so reading price alone treats 813 of
// the 1383 cards as free. Returns null when no printing has price data.
export function effectivePrice(card) {
  if (card.hasNormal && card.price > 0) return card.price;
  if (card.foilPrice > 0) return card.foilPrice;
  if (card.price > 0) return card.price;
  return null;
}

// Store and card-database links for the card detail popup. 121 printings carry
// no TCGplayer product id, so both return null rather than a broken URL.
export function tcgPlayerUrl(card) {
  return card?.marketId ? `https://www.tcgplayer.com/product/${card.marketId}` : null;
}

export function cardPageUrl(card) {
  return card?.slug ? `https://riftbound.gg/cards/${card.slug}/` : null;
}

// Natural sort by set then collector number ("OGN-007a" style ids)
export function defaultCardSort(a, b) {
  if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode);
  const na = a.id.slice(a.setCode.length + 1);
  const nb = b.id.slice(b.setCode.length + 1);
  return na.localeCompare(nb, undefined, { numeric: true });
}

// Cards with no price data sort to the end in both directions rather than
// pretending to be $0.00.
function byPrice(a, b, dir) {
  const pa = effectivePrice(a);
  const pb = effectivePrice(b);
  if (pa == null && pb == null) return defaultCardSort(a, b);
  if (pa == null) return 1;
  if (pb == null) return -1;
  return (pa - pb) * dir || defaultCardSort(a, b);
}

export const SORTERS = {
  default: defaultCardSort,
  name: (a, b) => a.name.localeCompare(b.name),
  'price-desc': (a, b) => byPrice(a, b, -1),
  'price-asc': (a, b) => byPrice(a, b, 1),
  rarity: (a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || defaultCardSort(a, b),
  cost: (a, b) => (a.cost ?? 99) - (b.cost ?? 99) || defaultCardSort(a, b),
};

export function ownedCopies(entry) {
  if (!entry) return { normal: 0, foil: 0, total: 0 };
  const normal = entry.normal || 0;
  const foil = entry.foil || 0;
  return { normal, foil, total: normal + foil };
}

// The wishlist stores a quantity per card. Entries written before it grew
// quantities are the literal `true`, which reads as a single copy rather than
// needing the file migrated.
export function wishlistQty(wishlist, cardId) {
  const v = wishlist?.[cardId];
  if (v === true) return 1;
  return Math.max(0, Number(v) || 0);
}

// Playset target used for "full set" completion: 3 copies, but 1 for
// Legends and Battlefields. Runes are excluded from set completion.
export function playsetTarget(card) {
  if (card.type === 'Rune') return 0;
  if (card.type === 'Legend' || card.type === 'Battlefield') return 1;
  return 3;
}

// 811 of the 1383 printings are foil-only and 54 are normal-only, so a CSV or a
// typed token can always name a finish its printing does not come in.
// CardTile hides the stepper for a missing finish, so recording the named finish
// blindly would create copies the collection grid can never show or edit. Both
// entry paths (the importer and rapid entry) route through this. A printing
// flagged for neither finish keeps what it was given, rather than being retyped
// into a finish that is just as absent.
export function routeFinish(card, kind) {
  if (kind === 'normal' && !card.hasNormal && card.hasFoil) return 'foil';
  if (kind === 'foil' && !card.hasFoil && card.hasNormal) return 'normal';
  return kind;
}
