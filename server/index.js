import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCards, refreshCards } from './cards.js';
import { getPower, importPower } from './power.js';
import { getLegends, getMetaMap, getStaples } from './riftdecks.js';
import { readJson, writeJson, listJson, deleteJson } from './store.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.API_PORT || 5175;

const app = express();
app.use(express.json({ limit: '20mb' }));

const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req, res);
    if (!res.headersSent) res.json(result);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
  }
};

// ---- Card database + prices ----
app.get('/api/cards', handle(() => getCards()));
app.post('/api/prices/refresh', handle(() => refreshCards()));

// ---- Power costs ----
// Runtime overlay on top of the committed baseline the client imports. The
// request carries the ids that currently read null, so nothing already known
// gets refetched.
app.get('/api/power', handle(() => getPower()));
app.post(
  '/api/power/import',
  handle(async (req) => {
    const { cards } = await getCards();
    return importPower(cards, req.body?.ids || null);
  })
);

// ---- Per-card stores ----
// The collection, the wishlist and the tags are the same file shape behind the
// same GET/PUT pair: { cards: {[cardId]: value}, updatedAt }. Only the route and
// the filename differ, so one registration covers all three -- a fourth store is
// one more cardStore() line, not another copy of this block.
//
// Tags are keyed by printing id, matching the collection rather than the folded
// deck identity: { "OGN-042": ["Keep", "Trade binder"] }.
const EMPTY_STORE = { cards: {}, updatedAt: null };

function cardStore(route, file) {
  app.get(route, handle(() => readJson(file, EMPTY_STORE)));
  app.put(
    route,
    handle(async (req) => {
      const cards = req.body?.cards;
      if (!cards || typeof cards !== 'object') throw new Error('Body must include a cards object');
      const payload = { cards, updatedAt: new Date().toISOString() };
      await writeJson(file, payload);
      return payload;
    })
  );
}

cardStore('/api/collection', 'collection.json');
cardStore('/api/wishlist', 'wishlist.json');
cardStore('/api/tags', 'tags.json');

// ---- Decks ----
const deckFile = (id) => {
  const safe = String(id).replace(/[^a-zA-Z0-9-]/g, '');
  if (!safe) throw new Error('Invalid deck id');
  return `decks/${safe}.json`;
};

app.get(
  '/api/decks',
  handle(async () => {
    const decks = await listJson('decks');
    decks.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return { decks };
  })
);
app.get(
  '/api/decks/:id',
  handle(async (req) => {
    const deck = await readJson(deckFile(req.params.id));
    if (!deck) throw new Error('Deck not found');
    return deck;
  })
);
app.post(
  '/api/decks',
  handle(async (req) => {
    const now = new Date().toISOString();
    const deck = { ...req.body, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await writeJson(deckFile(deck.id), deck);
    return deck;
  })
);
app.put(
  '/api/decks/:id',
  handle(async (req) => {
    const existing = await readJson(deckFile(req.params.id));
    if (!existing) throw new Error('Deck not found');
    const deck = {
      ...existing,
      ...req.body,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(deckFile(deck.id), deck);
    return deck;
  })
);
app.delete(
  '/api/decks/:id',
  handle(async (req) => {
    await deleteJson(deckFile(req.params.id));
    return { ok: true };
  })
);

// ---- Riftdecks meta data (for the True Bulk Analyzer) ----
app.get(
  '/api/meta/legends/:metagameId',
  handle((req) => getLegends(req.params.metagameId, { refresh: req.query.refresh === '1' }))
);
app.get(
  '/api/meta/metamap/:metagameId/:slug',
  handle((req) =>
    getMetaMap(req.params.metagameId, req.params.slug, { refresh: req.query.refresh === '1' })
  )
);
// The whole-format list for the Staples Analyzer "Field" and "Overlap" modes.
// It has no
// metagame id, because riftdecks.com ranks it over every Constructed deck.
app.get(
  '/api/meta/staples',
  handle((req) => getStaples({ refresh: req.query.refresh === '1' }))
);

// ---- Static frontend (production build) ----
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Riftbound manager server listening on http://localhost:${PORT}`);
});
