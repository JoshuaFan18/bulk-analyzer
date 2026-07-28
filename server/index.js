import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCards, refreshCards } from './cards.js';
import { getLegends, getMetaMap } from './riftdecks.js';
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

// ---- Collection ----
const EMPTY_COLLECTION = { cards: {}, updatedAt: null };
app.get('/api/collection', handle(() => readJson('collection.json', EMPTY_COLLECTION)));
app.put(
  '/api/collection',
  handle(async (req) => {
    const cards = req.body?.cards;
    if (!cards || typeof cards !== 'object') throw new Error('Body must include a cards object');
    const payload = { cards, updatedAt: new Date().toISOString() };
    await writeJson('collection.json', payload);
    return payload;
  })
);

// ---- Wishlist ----
const EMPTY_WISHLIST = { cards: {}, updatedAt: null };
app.get('/api/wishlist', handle(() => readJson('wishlist.json', EMPTY_WISHLIST)));
app.put(
  '/api/wishlist',
  handle(async (req) => {
    const cards = req.body?.cards;
    if (!cards || typeof cards !== 'object') throw new Error('Body must include a cards object');
    const payload = { cards, updatedAt: new Date().toISOString() };
    await writeJson('wishlist.json', payload);
    return payload;
  })
);

// ---- Card tags ----
// { cards: { "OGN-042": ["Keep", "Trade binder"] }, updatedAt }. Keyed by
// printing id, matching the collection rather than the folded deck identity.
const EMPTY_TAGS = { cards: {}, updatedAt: null };
app.get('/api/tags', handle(() => readJson('tags.json', EMPTY_TAGS)));
app.put(
  '/api/tags',
  handle(async (req) => {
    const cards = req.body?.cards;
    if (!cards || typeof cards !== 'object') throw new Error('Body must include a cards object');
    const payload = { cards, updatedAt: new Date().toISOString() };
    await writeJson('tags.json', payload);
    return payload;
  })
);

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

// ---- Static frontend (production build) ----
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Riftbound manager server listening on http://localhost:${PORT}`);
});
