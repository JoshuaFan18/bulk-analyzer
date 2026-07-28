import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state.jsx';
import CardTile from '../components/CardTile.jsx';
import StatsPanel from '../components/StatsPanel.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import RapidEntryDialog from '../components/RapidEntryDialog.jsx';
import Modal from '../components/Modal.jsx';
import { exportDotGg } from '../lib/importExport.js';
import { downloadText } from '../lib/download.js';
import {
  CARD_TYPES,
  COLORS,
  COLOR_HEX,
  MIGHT_BUCKETS,
  RARITIES,
  SORTERS,
  SUPERTYPES,
  cardMatchesText,
  isToken,
  matchesMight,
  matchesTypeFilter,
  ownedCopies,
  setLabel,
  wishlistQty,
} from '../lib/cards.js';
import {
  allApiTags,
  allCustomTags,
  displayTags,
  matchesTagFilter,
} from '../lib/tags.js';

const PAGE_SIZE = 96;

const DEFAULT_FILTERS = {
  set: 'any',
  colors: [],
  colorAnd: false,
  cost: 'any',
  rarity: 'any',
  type: 'any',
  might: 'any',
  keyword: 'any',
  tag: 'any',
  legality: 'any',
  errata: 'any',
  search: '',
  show: 'all',
  sort: 'default',
};

export default function CollectionPage() {
  const {
    cards,
    collection,
    wishlist,
    setQty,
    toggleWishlist,
    setWishlistQty,
    tags,
    inDeckIndex,
    addCardTag,
    removeCardTag,
    pricesFetchedAt,
    refreshPrices,
    refreshingPrices,
    keywordIndex,
  } = useApp();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showStats, setShowStats] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRapid, setShowRapid] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const set = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setVisibleCount(PAGE_SIZE);
  };

  const setNames = useMemo(() => {
    const seen = new Map();
    for (const c of cards) if (!seen.has(c.setCode)) seen.set(c.setCode, setLabel(c));
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards]);

  const filtered = useMemo(() => {
    let list = cards.filter((card) => {
      if (filters.set !== 'any' && card.setCode !== filters.set) return false;
      if (filters.rarity !== 'any') {
        if (filters.rarity === 'none' ? card.rarity : card.rarity !== filters.rarity) return false;
      }
      if (!matchesTypeFilter(card, filters.type)) return false;
      if (!matchesMight(card, filters.might)) return false;
      if (filters.cost !== 'any') {
        const c = card.cost;
        if (filters.cost === '7+' ? !(c >= 7) : c !== Number(filters.cost)) return false;
      }
      if (filters.legality !== 'any') {
        if (filters.legality === 'banned' ? !card.banned : card.banned) return false;
      }
      if (filters.errata !== 'any') {
        const hasErrata = !!card.errata;
        if (filters.errata === 'yes' ? !hasErrata : hasErrata) return false;
      }
      if (filters.keyword !== 'any' && !keywordIndex.byCard.get(card.id)?.has(filters.keyword)) {
        return false;
      }
      if (filters.colors.length > 0) {
        const cardColors = card.colors || [];
        const match = filters.colorAnd
          ? filters.colors.every((c) => cardColors.includes(c))
          : filters.colors.some((c) => cardColors.includes(c));
        if (!match) return false;
      }
      if (!matchesTagFilter(card, filters.tag, { tags, wishlist, inDeckIndex })) return false;
      if (!cardMatchesText(card, filters.search)) return false;

      const { total } = ownedCopies(collection[card.id]);
      if (filters.show === 'owned' && total === 0) return false;
      if (filters.show === 'missing' && total > 0) return false;
      if (filters.show === 'wishlist' && !wishlist[card.id]) return false;
      if (filters.show === 'incomplete') {
        if (total >= 3 || isToken(card)) return false;
      }
      return true;
    });
    list.sort(SORTERS[filters.sort] || SORTERS.default);
    return list;
  }, [cards, filters, collection, wishlist, keywordIndex, tags, inDeckIndex]);

  // API tags (regions, creature types, champion names) are filterable but never
  // rendered on a tile — 128 of them would bury the handful you set yourself.
  const apiTags = useMemo(() => allApiTags(cards), [cards]);
  const customTags = useMemo(() => allCustomTags(tags), [tags]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((v) => Math.min(v + PAGE_SIZE, filtered.length));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      <h1 className="page-title">My Collection</h1>
      <p className="page-sub">
        Track your Riftbound collection, its market value, and completion progress.
      </p>

      <div className="filter-bar">
        <select value={filters.set} onChange={(e) => set({ set: e.target.value })}>
          <option value="any">Set: Any</option>
          {setNames.map(([code, name]) => (
            <option key={code} value={code}>
              {code} — {name}
            </option>
          ))}
        </select>

        <div className="color-chips">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`color-chip ${filters.colors.includes(color) ? 'on' : ''}`}
              style={{ background: COLOR_HEX[color] }}
              title={color}
              onClick={() =>
                set({
                  colors: filters.colors.includes(color)
                    ? filters.colors.filter((c) => c !== color)
                    : [...filters.colors, color],
                })
              }
            >
              {color[0]}
            </button>
          ))}
        </div>
        <label className="inline">
          <input
            type="checkbox"
            checked={filters.colorAnd}
            onChange={(e) => set({ colorAnd: e.target.checked })}
          />
          AND
        </label>

        <select value={filters.cost} onChange={(e) => set({ cost: e.target.value })}>
          <option value="any">Cost: Any</option>
          {[0, 1, 2, 3, 4, 5, 6].map((c) => (
            <option key={c} value={c}>
              Cost: {c}
            </option>
          ))}
          <option value="7+">Cost: 7+</option>
        </select>

        <select value={filters.rarity} onChange={(e) => set({ rarity: e.target.value })}>
          <option value="any">Rarity: Any</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value="none">No rarity (tokens)</option>
        </select>

        <select value={filters.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="any">Type: Any</option>
          <optgroup label="Card type">
            {CARD_TYPES.map((t) => (
              <option key={t} value={`type:${t}`}>
                {t}
              </option>
            ))}
          </optgroup>
          <optgroup label="Super type">
            {SUPERTYPES.map((t) => (
              <option key={t} value={`super:${t}`}>
                {t}
              </option>
            ))}
          </optgroup>
        </select>

        <select value={filters.might} onChange={(e) => set({ might: e.target.value })}>
          <option value="any">Might: Any</option>
          {MIGHT_BUCKETS.map((m) => (
            <option key={m} value={m}>
              Might: {m}
            </option>
          ))}
        </select>

        <select value={filters.keyword} onChange={(e) => set({ keyword: e.target.value })}>
          <option value="any">Keyword: Any</option>
          {keywordIndex.all.map(([kw, n]) => (
            <option key={kw} value={kw}>
              {kw} ({n})
            </option>
          ))}
        </select>

        <select value={filters.legality} onChange={(e) => set({ legality: e.target.value })}>
          <option value="any">Legality: Any</option>
          <option value="legal">Legal only</option>
          <option value="banned">Banned only</option>
        </select>

        <select value={filters.errata} onChange={(e) => set({ errata: e.target.value })}>
          <option value="any">Errata: Any</option>
          <option value="yes">Has errata</option>
          <option value="no">No errata</option>
        </select>

        <select value={filters.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value="any">Tag: Any</option>
          <optgroup label="Status">
            <option value="auto:wishlist">Wishlisted</option>
            <option value="auto:indeck">In Deck</option>
            <option value="auto:untagged">No custom tags</option>
          </optgroup>
          {customTags.length > 0 && (
            <optgroup label="My tags">
              {customTags.map((t) => (
                <option key={t} value={`custom:${t}`}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Card tags">
            {apiTags.map((t) => (
              <option key={t} value={`api:${t}`}>
                {t}
              </option>
            ))}
          </optgroup>
        </select>

        <input
          type="search"
          placeholder="Search name, ID, or text…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          style={{ minWidth: 200 }}
        />
      </div>

      {/* Shared by every tile's add-tag input. */}
      <datalist id="custom-tag-names">
        {customTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="toolbar">
        <span className="count-note">{filtered.length} cards</span>
        <button onClick={() => setShowRapid(true)}>Rapid entry</button>
        <button onClick={() => setShowImport(true)}>Import</button>
        <button onClick={() => setShowExport(true)}>Export</button>
        <button onClick={refreshPrices} disabled={refreshingPrices}>
          {refreshingPrices ? 'Updating prices…' : 'Update TCGplayer prices'}
        </button>
        {pricesFetchedAt && (
          <span className="count-note">
            prices as of {new Date(pricesFetchedAt).toLocaleString()}
          </span>
        )}
        <span className="spacer" />
        <select value={filters.show} onChange={(e) => set({ show: e.target.value })}>
          <option value="all">Show: All cards</option>
          <option value="owned">Show: Owned</option>
          <option value="missing">Show: Not owned</option>
          <option value="incomplete">Show: Incomplete playset</option>
          <option value="wishlist">Show: Wishlisted</option>
        </select>
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="default">Sort: Default</option>
          <option value="name">Sort: Name</option>
          <option value="price-desc">Sort: Price high → low</option>
          <option value="price-asc">Sort: Price low → high</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="cost">Sort: Cost</option>
        </select>
        <button onClick={() => setShowStats((s) => !s)}>
          {showStats ? 'Hide stats' : 'Stats'}
        </button>
        <button
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          Reset
        </button>
      </div>

      <div className={`collection-layout ${showStats ? '' : 'no-stats'}`}>
        <div>
          <div className="card-grid">
            {visible.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                entry={collection[card.id]}
                onSetQty={setQty}
                wishlistQty={wishlistQty(wishlist, card.id)}
                onToggleWishlist={toggleWishlist}
                onSetWishlistQty={setWishlistQty}
                tags={displayTags(card.id, { tags, wishlist, inDeckIndex })}
                onAddTag={addCardTag}
                onRemoveTag={removeCardTag}
              />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="load-more" ref={sentinelRef}>
              Loading more… ({visibleCount} of {filtered.length})
            </div>
          )}
        </div>
        {showStats && <StatsPanel cards={cards} collection={collection} />}
      </div>

      {showRapid && <RapidEntryDialog onClose={() => setShowRapid(false)} />}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  );
}

function ExportDialog({ onClose }) {
  const { cards, collection } = useApp();
  const csv = useMemo(() => exportDotGg(cards, collection), [cards, collection]);

  const download = () => downloadText('riftbound-collection.csv', csv);

  return (
    <Modal title="Export collection" onClose={onClose}>
      <p className="muted">DotGG format — accepted by riftbound.gg imports.</p>
      <textarea readOnly value={csv} onFocus={(e) => e.target.select()} />
      <div className="modal-actions">
        <button onClick={() => navigator.clipboard.writeText(csv)}>Copy to clipboard</button>
        <button className="primary" onClick={download}>
          Download CSV
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
