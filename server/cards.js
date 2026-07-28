import { readJson, writeJson } from './store.js';

const API_URL = 'https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed';
const CACHE_FILE = 'cards.json';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchCardsFromApi() {
  const res = await fetch(API_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`DotGG API returned ${res.status}`);
  const json = await res.json();
  const idx = Object.fromEntries(json.names.map((n, i) => [n, i]));
  const get = (row, field) => row[idx[field]];

  return json.data.map((row) => {
    const id = get(row, 'id');
    return {
      id,
      setCode: String(id).split('-')[0],
      slug: get(row, 'slug'),
      name: get(row, 'name'),
      effect: get(row, 'effect') || '',
      // Flavour text and the TCGplayer product id back the card detail popup.
      // 710 printings have no flavour and 121 have no market id, so both are
      // optional everywhere they are read.
      flavor: get(row, 'flavor') || '',
      marketId: get(row, 'marketIds') || null,
      colors: get(row, 'color') || [],
      cost: num(get(row, 'cost')),
      type: get(row, 'type') || '',
      supertype: get(row, 'supertype') || '',
      might: num(get(row, 'might')),
      tags: get(row, 'tags') || [],
      setName: get(row, 'set_name') || '',
      rarity: get(row, 'rarity') || '',
      image: get(row, 'image'),
      promo: get(row, 'promo') === '1',
      price: num(get(row, 'price')),
      foilPrice: num(get(row, 'foilPrice')),
      hasNormal: get(row, 'hasNormal') === '1',
      hasFoil: get(row, 'hasFoil') === '1',
      banned: get(row, 'banned') === '1',
      errata: get(row, 'errata') || null,
    };
  });
}

export async function getCards() {
  const cached = await readJson(CACHE_FILE);
  if (cached && Array.isArray(cached.cards) && cached.cards.length > 0) return cached;
  return refreshCards();
}

export async function refreshCards() {
  const cards = await fetchCardsFromApi();
  const payload = { fetchedAt: new Date().toISOString(), count: cards.length, cards };
  await writeJson(CACHE_FILE, payload);
  return payload;
}
