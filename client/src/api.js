async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
  return body;
}

export const api = {
  getCards: () => request('/api/cards'),
  refreshPrices: () => request('/api/prices/refresh', { method: 'POST' }),
  getPower: () => request('/api/power'),
  importPower: (ids) =>
    request('/api/power/import', { method: 'POST', body: JSON.stringify({ ids }) }),
  getCollection: () => request('/api/collection'),
  saveCollection: (cards) =>
    request('/api/collection', { method: 'PUT', body: JSON.stringify({ cards }) }),
  getWishlist: () => request('/api/wishlist'),
  saveWishlist: (cards) =>
    request('/api/wishlist', { method: 'PUT', body: JSON.stringify({ cards }) }),
  getTags: () => request('/api/tags'),
  saveTags: (cards) => request('/api/tags', { method: 'PUT', body: JSON.stringify({ cards }) }),
  listDecks: () => request('/api/decks'),
  getDeck: (id) => request(`/api/decks/${id}`),
  createDeck: (deck) => request('/api/decks', { method: 'POST', body: JSON.stringify(deck) }),
  updateDeck: (id, deck) =>
    request(`/api/decks/${id}`, { method: 'PUT', body: JSON.stringify(deck) }),
  deleteDeck: (id) => request(`/api/decks/${id}`, { method: 'DELETE' }),
  getMetaLegends: (metagameId, refresh = false) =>
    request(`/api/meta/legends/${metagameId}${refresh ? '?refresh=1' : ''}`),
  getMetaMap: (metagameId, slug, refresh = false) =>
    request(`/api/meta/metamap/${metagameId}/${slug}${refresh ? '?refresh=1' : ''}`),
  getStaples: (refresh = false) => request(`/api/meta/staples${refresh ? '?refresh=1' : ''}`),
};
