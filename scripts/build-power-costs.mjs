// Regenerates client/src/data/powerCosts.json — a static { [dotggCardId]: power }
// map of each card's POWER (colored) cost, the one gameplay stat the DotGG API
// (server/cards.js) does not expose. It only carries `cost`, which is the ENERGY
// (generic) cost; the colored-pip requirement is absent.
//
// Source: api.riftcodex.com (keyless, community). Its `attributes.energy` is byte
// for byte the same as DotGG `cost` (verified: 1260/1280 identical, the other 20
// are 0-vs-null), so we take only `attributes.power` from it. Riot's own
// riftbound-content-v1 endpoint has the same data but is gated to approved
// production keys, so it is not usable here.
//
// Run after a new set drops (or when prices are refreshed and new cards appear):
//   node scripts/build-power-costs.mjs
// Then restart nothing — Vite picks up the JSON on next reload.
//
// Matching: primary join is DotGG `marketId` <-> riftcodex `tcgplayer_id` (the
// TCGplayer product id, exact). Falls back to a normalized set+number id. Then
// power is folded across printings by card identity (name minus any parenthetical,
// normalized) so alt-art and promo printings inherit their base card's power —
// the same identity rule the app uses everywhere on the deck side. Only
// cost-bearing cards (DotGG cost != null) get an entry; Legends, Battlefields,
// Runes and tokens have no power concept and are left out (they read as null).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOTGG_CACHE = resolve(ROOT, 'data/cards.json');
const OUT = resolve(ROOT, 'client/src/data/powerCosts.json');
const RIFTCODEX = 'https://api.riftcodex.com/cards';

// Mirror of lib/cards.js so the fold matches the app exactly.
const PAREN_SUFFIX = /\s*\([\s\S]*\)\s*$/;
const normName = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const cardIdentity = (name) => normName(String(name).replace(PAREN_SUFFIX, ''));

// OGN-039a / UNL-024A -> ogn-039a ; riftcodex unl-116a-219 / unl-229*-219 -> unl-116a
const idKey = (setPlusNum) => String(setPlusNum).toLowerCase().replace('*', '');

async function fetchRiftcodex() {
  const out = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await fetch(`${RIFTCODEX}?page=${page}&size=100`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (bulk_analyzer power-cost sync)' },
    });
    if (!res.ok) throw new Error(`riftcodex returned ${res.status} on page ${page}`);
    const json = await res.json();
    out.push(...json.items);
    pages = json.pages;
    page += 1;
  } while (page <= pages);
  return out;
}

function main(rc) {
  const dot = JSON.parse(readFileSync(DOTGG_CACHE, 'utf8').replace(/^﻿/, '')).cards;

  const rcByTcg = new Map();
  const rcById = new Map();
  for (const c of rc) {
    if (c.tcgplayer_id) rcByTcg.set(String(c.tcgplayer_id), c);
    const parts = String(c.riftbound_id).split('-'); // unl-116a-219
    if (parts.length >= 2) rcById.set(idKey(`${parts[0]}-${parts[1]}`), c);
  }

  // Direct matches: dotId -> power (only where the DotGG card has an energy cost).
  const direct = new Map();
  let byTcg = 0;
  let byId = 0;
  for (const c of dot) {
    if (c.cost == null) continue; // no cost concept -> no power
    let m = c.marketId ? rcByTcg.get(String(c.marketId)) : null;
    if (m) byTcg += 1;
    else {
      const parts = String(c.id).split('-');
      m = parts.length >= 2 ? rcById.get(idKey(`${parts[0]}-${parts[1]}`)) : null;
      if (m) byId += 1;
    }
    if (!m) continue;
    const p = m.attributes ? m.attributes.power : null;
    direct.set(c.id, p == null ? 0 : Number(p));
  }

  // Fold across printings by identity so unmatched alt-art / promo variants
  // inherit the base card's power. Flag any identity whose matched printings
  // disagree (should never happen for a real card).
  const powerByIdentity = new Map();
  const conflicts = [];
  for (const c of dot) {
    if (!direct.has(c.id)) continue;
    const key = cardIdentity(c.name);
    const p = direct.get(c.id);
    if (powerByIdentity.has(key) && powerByIdentity.get(key) !== p) {
      conflicts.push(`${key}: ${powerByIdentity.get(key)} vs ${p} (${c.id})`);
    } else {
      powerByIdentity.set(key, p);
    }
  }

  const map = {};
  const gaps = [];
  for (const c of dot) {
    if (c.cost == null) continue;
    if (direct.has(c.id)) map[c.id] = direct.get(c.id);
    else {
      const folded = powerByIdentity.get(cardIdentity(c.name));
      if (folded != null) map[c.id] = folded;
      else gaps.push(`${c.id} ${c.name}`);
    }
  }

  // Stable, id-sorted output for a clean diff.
  const sorted = {};
  for (const id of Object.keys(map).sort()) sorted[id] = map[id];

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(sorted, null, 0).replace(/,/g, ',\n  ').replace(/^{/, '{\n  ').replace(/}$/, '\n}') + '\n');

  const dist = {};
  for (const v of Object.values(sorted)) dist[v] = (dist[v] || 0) + 1;
  console.log(`riftcodex cards: ${rc.length}  DotGG cards: ${dot.length}`);
  console.log(`matched by tcgplayer_id: ${byTcg}  by id-string: ${byId}`);
  console.log(`power entries written: ${Object.keys(sorted).length}  ->  ${OUT}`);
  console.log(`power distribution:`, dist);
  if (conflicts.length) console.log(`IDENTITY CONFLICTS (${conflicts.length}):\n  ${conflicts.join('\n  ')}`);
  console.log(`cost-bearing cards with no power resolved: ${gaps.length}`);
  if (gaps.length) console.log(`  ${gaps.slice(0, 40).join('\n  ')}`);
}

main(await fetchRiftcodex());
