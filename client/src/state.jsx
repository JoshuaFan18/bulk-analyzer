import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { buildKeywordIndex, buildOwnedIndex, playsetTarget, wishlistQty } from './lib/cards.js';
import { buildInDeckIndex } from './lib/deck.js';
import { isReservedTag } from './lib/tags.js';
import POWER_COSTS from './data/powerCosts.json';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [cardsPayload, setCardsPayload] = useState(null);
  const [powerOverlay, setPowerOverlay] = useState({});
  const [collection, setCollection] = useState({});
  const [wishlist, setWishlist] = useState({});
  const [tags, setTags] = useState({});
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [importingPower, setImportingPower] = useState(false);

  const collectionTimer = useRef(null);
  const wishlistTimer = useRef(null);
  const tagsTimer = useRef(null);

  useEffect(() => {
    Promise.all([
      api.getCards(),
      api.getCollection(),
      api.getWishlist(),
      api.getTags(),
      api.listDecks(),
      // The overlay is an enhancement, not a requirement -- an Express process
      // started before this route existed 404s, and the app must still boot.
      api.getPower().catch(() => ({ cards: {} })),
    ])
      .then(([cardsRes, collectionRes, wishlistRes, tagsRes, decksRes, powerRes]) => {
        setCardsPayload(cardsRes);
        setCollection(collectionRes.cards || {});
        setWishlist(wishlistRes.cards || {});
        setTags(tagsRes.cards || {});
        setDecks(decksRes.decks || []);
        setPowerOverlay(powerRes.cards || {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Decks are the source of the [In Deck] chip, so the collection page needs
  // them refreshed whenever the builder saves.
  const reloadDecks = async () => {
    try {
      const res = await api.listDecks();
      setDecks(res.decks || []);
    } catch (e) {
      setError(e.message);
    }
  };

  // DotGG's feed carries only the ENERGY cost (card.cost). The POWER (colored)
  // cost is merged in from the committed baseline (scripts/build-power-costs.mjs),
  // with the Config page's import filling any gap it left into data/power.json.
  // The baseline wins, so a re-import can never rewrite a known value. Power is
  // null for cards with no power concept -- Legends, Battlefields, Runes, tokens.
  const cards = useMemo(
    () =>
      (cardsPayload?.cards || []).map((c) => ({
        ...c,
        power: POWER_COSTS[c.id] ?? powerOverlay[c.id] ?? null,
      })),
    [cardsPayload, powerOverlay],
  );
  const cardsById = useMemo(() => {
    const m = new Map();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  // Deck views count copies across all printings, so an alt-art Rengar counts
  // toward the base Rengar a deck lists.
  const ownedIndex = useMemo(() => buildOwnedIndex(cards, collection), [cards, collection]);

  // Parsed once rather than per filter pass — the effect text never changes.
  const keywordIndex = useMemo(() => buildKeywordIndex(cards), [cards]);

  // cardId -> deck names, for the [In Deck] chip.
  const inDeckIndex = useMemo(() => buildInDeckIndex(decks), [decks]);

  const scheduleSave = (ref, fn) => {
    clearTimeout(ref.current);
    setSaving(true);
    ref.current = setTimeout(async () => {
      try {
        await fn();
      } catch (e) {
        setError(`Save failed: ${e.message}`);
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  // Latest collection snapshot, so debounced saves always send fresh data
  const nextRef = useRef(undefined);

  const setQty = (cardId, kind, qty) => {
    setCollection((prev) => {
      const entry = { normal: 0, foil: 0, ...prev[cardId] };
      entry[kind] = Math.max(0, qty);
      const next = { ...prev };
      if (entry.normal === 0 && entry.foil === 0) delete next[cardId];
      else next[cardId] = entry;
      nextRef.current = next;
      scheduleSave(collectionTimer, () => api.saveCollection(nextRef.current));
      return next;
    });
  };

  const replaceCollection = (entries) => {
    setCollection(entries);
    nextRef.current = entries;
    scheduleSave(collectionTimer, () => api.saveCollection(entries));
  };

  // Deltas may be negative (rapid entry's "-3" removes a copy), so this clamps
  // and prunes exactly like setQty does. Without that a removal would write a
  // negative quantity, and a card taken back to zero would linger in
  // collection.json as {normal: 0, foil: 0} instead of being deleted.
  const mergeCollection = (entries) => {
    setCollection((prev) => {
      const next = { ...prev };
      for (const [id, add] of Object.entries(entries)) {
        const entry = { normal: 0, foil: 0, ...next[id] };
        entry.normal = Math.max(0, entry.normal + (add.normal || 0));
        entry.foil = Math.max(0, entry.foil + (add.foil || 0));
        if (entry.normal === 0 && entry.foil === 0) delete next[id];
        else next[id] = entry;
      }
      nextRef.current = next;
      scheduleSave(collectionTimer, () => api.saveCollection(nextRef.current));
      return next;
    });
  };

  // Two mutators now share the wishlist debounce, so they go through a ref for
  // the same reason setQty does.
  const wishlistNextRef = useRef(undefined);

  const setWishlistQty = (cardId, qty) => {
    setWishlist((prev) => {
      const next = { ...prev };
      const n = Math.max(0, Math.floor(Number(qty) || 0));
      if (n === 0) delete next[cardId];
      else next[cardId] = n;
      wishlistNextRef.current = next;
      scheduleSave(wishlistTimer, () => api.saveWishlist(wishlistNextRef.current));
      return next;
    });
  };

  // Starring a card wishlists what you are missing from a playset. The floor of
  // 1 matters: playsetTarget returns 0 for Runes, so without it starring a rune
  // would immediately unstar it.
  const toggleWishlist = (cardId, card) => {
    setWishlist((prev) => {
      const next = { ...prev };
      if (wishlistQty(prev, cardId) > 0) {
        delete next[cardId];
      } else {
        const owned = collection[cardId];
        const have = (owned?.normal || 0) + (owned?.foil || 0);
        const target = card ? playsetTarget(card) : 1;
        next[cardId] = Math.max(1, target - have);
      }
      wishlistNextRef.current = next;
      scheduleSave(wishlistTimer, () => api.saveWishlist(wishlistNextRef.current));
      return next;
    });
  };

  const tagsNextRef = useRef(undefined);

  const writeTags = (updater) => {
    setTags((prev) => {
      const next = updater(prev);
      tagsNextRef.current = next;
      scheduleSave(tagsTimer, () => api.saveTags(tagsNextRef.current));
      return next;
    });
  };

  const addCardTag = (cardId, name) => {
    const tag = String(name || '').trim();
    if (!tag || isReservedTag(tag)) return;
    writeTags((prev) => {
      const list = prev[cardId] || [];
      if (list.includes(tag)) return prev;
      return { ...prev, [cardId]: [...list, tag] };
    });
  };

  const removeCardTag = (cardId, name) => {
    writeTags((prev) => {
      const list = prev[cardId] || [];
      if (!list.includes(name)) return prev;
      const rest = list.filter((t) => t !== name);
      const next = { ...prev };
      if (rest.length === 0) delete next[cardId];
      else next[cardId] = rest;
      return next;
    });
  };

  const toggleCardTag = (cardId, name) => {
    if (tags[cardId]?.includes(name)) removeCardTag(cardId, name);
    else addCardTag(cardId, name);
  };

  const refreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      const res = await api.refreshPrices();
      setCardsPayload(res);
      return res;
    } finally {
      setRefreshingPrices(false);
    }
  };

  // Resolves power for the cards that still read null and nothing else, so the
  // request stays small and a known value is never refetched.
  const importPower = async (ids) => {
    setImportingPower(true);
    try {
      const res = await api.importPower(ids);
      setPowerOverlay(res.cards || {});
      return res;
    } finally {
      setImportingPower(false);
    }
  };

  const value = {
    cards,
    cardsById,
    ownedIndex,
    keywordIndex,
    inDeckIndex,
    pricesFetchedAt: cardsPayload?.fetchedAt || null,
    collection,
    wishlist,
    tags,
    decks,
    loading,
    error,
    saving,
    refreshingPrices,
    importingPower,
    setQty,
    replaceCollection,
    mergeCollection,
    toggleWishlist,
    setWishlistQty,
    addCardTag,
    removeCardTag,
    toggleCardTag,
    reloadDecks,
    refreshPrices,
    importPower,
    dismissError: () => setError(null),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
