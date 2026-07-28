import { readJson, writeJson } from './store.js';

// POWER (colored) cost, the one gameplay stat the DotGG feed does not carry --
// its `cost` is the ENERGY (generic) cost and there is no colored-cost field.
// Source is api.riftcodex.com, which is keyless. Its `attributes.energy` is
// identical to DotGG `cost` (verified across every card both sources share), so
// only `power` is taken from it. Riot's own riftbound-content-v1 has the same
// stat but is gated to approved production keys.
//
// Two consumers share the fetch and the join below:
//   - scripts/build-power-costs.mjs, which writes the committed baseline at
//     client/src/data/powerCosts.json (the client imports that at build time)
//   - POST /api/power/import, the Config page's button, which fills whatever the
//     baseline is missing into data/power.json at runtime
const API_URL = 'https://api.riftcodex.com/cards';
// 200 comes back 422 -- 100 is the ceiling.
const PAGE_SIZE = 100;
const OVERLAY_FILE = 'power.json';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export const EMPTY_POWER = { cards: {}, updatedAt: null };

// Mirrors of lib/cards.js. Kept local so the server does not reach across into
// the client tree for two pure helpers, but they must stay in step -- the fold
// below has to group printings exactly the way the app does.
const PAREN_SUFFIX = /\s*\([\s\S]*\)\s*$/;
const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
const cardIdentity = (name) => normName(String(name).replace(PAREN_SUFFIX, ''));
const isToken = (card) => card.supertype === 'Token' || card.type === '';

// A card can only carry a power cost if it has an energy cost and is not a
// token. Legends, Battlefields and Runes have no cost at all, and the 16
// double-faced tokens (`Baron Pit // Buff`) carry cost 0 but no power -- counting
// them as eligible would report a permanent shortfall no import could close.
export const hasPowerConcept = (card) => card.cost != null && !isToken(card);

// OGN-039a -> ogn-039a, and riftcodex unl-116a-219 / unl-229*-219 -> unl-116a.
const idKey = (setPlusNum) => String(setPlusNum).toLowerCase().replace('*', '');
function shortId(id) {
  const parts = String(id).split('-');
  return parts.length >= 2 ? idKey(`${parts[0]}-${parts[1]}`) : null;
}

export async function fetchRiftcodexCards() {
  const out = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await fetch(`${API_URL}?page=${page}&size=${PAGE_SIZE}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`riftcodex API returned ${res.status} on page ${page}`);
    const json = await res.json();
    out.push(...json.items);
    pages = json.pages;
    page += 1;
  } while (page <= pages);
  return out;
}

// Joins the DotGG card list to riftcodex and returns { [cardId]: power }.
// The primary key is the TCGplayer product id, which both sides carry and which
// is exact. The fallback is set+collector number. Power is then folded across
// printings by card identity so alt-art and promo printings, which frequently
// have no riftcodex row of their own, inherit their base card's power.
// Only cards with a power concept get an entry (see hasPowerConcept) -- Legends,
// Battlefields, Runes and tokens are left out so they read as null.
export function buildPowerMap(dotCards, rcCards) {
  const byTcgId = new Map();
  const byShortId = new Map();
  for (const c of rcCards) {
    if (c.tcgplayer_id) byTcgId.set(String(c.tcgplayer_id), c);
    const key = shortId(c.riftbound_id);
    if (key) byShortId.set(key, c);
  }

  const direct = new Map();
  let matchedByTcgId = 0;
  let matchedByShortId = 0;
  for (const card of dotCards) {
    if (!hasPowerConcept(card)) continue;
    let hit = card.marketId ? byTcgId.get(String(card.marketId)) : null;
    if (hit) matchedByTcgId += 1;
    else {
      const key = shortId(card.id);
      hit = key ? byShortId.get(key) : null;
      if (hit) matchedByShortId += 1;
    }
    if (!hit) continue;
    const power = hit.attributes ? hit.attributes.power : null;
    direct.set(card.id, power == null ? 0 : Number(power));
  }

  const byIdentity = new Map();
  const conflicts = [];
  for (const card of dotCards) {
    if (!direct.has(card.id)) continue;
    const key = cardIdentity(card.name);
    const power = direct.get(card.id);
    if (byIdentity.has(key) && byIdentity.get(key) !== power) {
      conflicts.push(`${card.name}: ${byIdentity.get(key)} vs ${power} (${card.id})`);
    } else {
      byIdentity.set(key, power);
    }
  }

  const map = {};
  const unresolved = [];
  for (const card of dotCards) {
    if (!hasPowerConcept(card)) continue;
    if (direct.has(card.id)) {
      map[card.id] = direct.get(card.id);
      continue;
    }
    const folded = byIdentity.get(cardIdentity(card.name));
    if (folded != null) map[card.id] = folded;
    else unresolved.push({ id: card.id, name: card.name });
  }

  return { map, stats: { matchedByTcgId, matchedByShortId, conflicts, unresolved } };
}

export async function getPower() {
  return readJson(OVERLAY_FILE, EMPTY_POWER);
}

// Fills power for the requested card ids only, leaving anything already known
// untouched -- the Config page sends exactly the ids that currently read null,
// so a card the committed baseline already covers is never refetched or
// overwritten. Omitting ids resolves every cost-bearing card.
export async function importPower(dotCards, ids = null) {
  const wanted = ids && ids.length ? new Set(ids) : null;
  const rcCards = await fetchRiftcodexCards();
  // The join runs over the whole card list even when only a few ids are wanted,
  // because the identity fold needs every printing of a card to find the one
  // that matched.
  const { map, stats } = buildPowerMap(dotCards, rcCards);

  const existing = await getPower();
  const next = { ...(existing.cards || {}) };
  let added = 0;
  for (const [cardId, power] of Object.entries(map)) {
    if (wanted && !wanted.has(cardId)) continue;
    if (next[cardId] === power) continue;
    next[cardId] = power;
    added += 1;
  }

  const unresolved = wanted
    ? stats.unresolved.filter((u) => wanted.has(u.id))
    : stats.unresolved;

  const payload = { cards: next, updatedAt: new Date().toISOString() };
  await writeJson(OVERLAY_FILE, payload);
  return {
    ...payload,
    requested: wanted ? wanted.size : Object.keys(map).length,
    added,
    unresolved,
    conflicts: stats.conflicts,
    source: 'api.riftcodex.com',
  };
}
