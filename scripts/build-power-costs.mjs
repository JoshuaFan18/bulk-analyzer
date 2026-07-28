// Regenerates client/src/data/powerCosts.json -- the committed baseline map of
// each card's POWER (colored) cost, the one gameplay stat the DotGG API does not
// expose. The client imports this file at build time, which is why it is tracked
// in git while everything under data/ is not.
//
// The fetch and the join live in server/power.js and are shared with the Config
// page's "Import Power" button, so the two paths can never drift. This script
// writes the baseline; the button fills any gap the baseline left into
// data/power.json at runtime.
//
// Run after a new set drops:
//   node scripts/build-power-costs.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchRiftcodexCards, buildPowerMap } from '../server/power.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOTGG_CACHE = resolve(ROOT, 'data/cards.json');
const OUT = resolve(ROOT, 'client/src/data/powerCosts.json');

const dot = JSON.parse(readFileSync(DOTGG_CACHE, 'utf8').replace(/^﻿/, '')).cards;
const rc = await fetchRiftcodexCards();
const { map, stats } = buildPowerMap(dot, rc);

// Id-sorted, one entry per line, for a readable diff when a set is added.
const ids = Object.keys(map).sort();
const body = ids.map((id) => `  ${JSON.stringify(id)}: ${map[id]}`).join(',\n');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `{\n${body}\n}\n`);

const dist = {};
for (const id of ids) dist[map[id]] = (dist[map[id]] || 0) + 1;
console.log(`riftcodex cards: ${rc.length}  DotGG cards: ${dot.length}`);
console.log(`matched by tcgplayer_id: ${stats.matchedByTcgId}  by set+number: ${stats.matchedByShortId}`);
console.log(`power entries written: ${ids.length}  ->  ${OUT}`);
console.log('power distribution:', dist);
if (stats.conflicts.length) {
  console.log(`IDENTITY CONFLICTS (${stats.conflicts.length}):\n  ${stats.conflicts.join('\n  ')}`);
}
console.log(`cards with a power concept but no power resolved: ${stats.unresolved.length}`);
if (stats.unresolved.length) {
  console.log(`  ${stats.unresolved.slice(0, 40).map((u) => `${u.id} ${u.name}`).join('\n  ')}`);
}
