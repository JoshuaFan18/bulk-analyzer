import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import Modal from '../components/Modal.jsx';
import DeckStats from '../components/DeckStats.jsx';
import DeckCollectionList from '../components/DeckCollectionList.jsx';
import DeckExportModal from '../components/DeckExportModal.jsx';
import DeckTabs from '../components/DeckTabs.jsx';
import CardDetailModal from '../components/CardDetailModal.jsx';
import PowerCost from '../components/PowerCost.jsx';
import DeckFilterModal from '../components/DeckFilterModal.jsx';
import {
  COLORS,
  cardIdentity,
  cardMatchesText,
  championMatchesLegend,
  championOf,
  dedupeByIdentity,
  effectivePrice,
  energyBucket,
  isBasePrinting,
  isToken,
  matchesCost,
  matchesMight,
  matchesPower,
  matchesSupertype,
  matchesType,
  mightBucket,
  ownedAcrossPrintings,
  powerBucket,
  setNameOptions,
  signatureAllowed,
  withinLegendDomains,
} from '../lib/cards.js';
import {
  MAIN_GROUPS,
  inMainGroup,
  MAX_SIGNATURE_CARDS,
  ZONES,
  ZONE_LADDER,
  addCard,
  canMoveCard,
  deckCopyLimit,
  deckEntries,
  emptyDeck,
  mainTarget,
  moveCard,
  parseDeckText,
  removeCard,
  deckValidation,
  signatureCount,
  zoneCount,
} from '../lib/deck.js';
import { allApiTags, allCustomTags, matchesTagFilter } from '../lib/tags.js';

const POOL_TABS = [
  { id: 'all', label: 'All' },
  { id: 'legend', label: 'Legends' },
  { id: 'champion', label: 'Champion' },
  { id: 'maindeck', label: 'Main Deck' },
  { id: 'battlefields', label: 'Battlefields' },
  { id: 'runes', label: 'Runes' },
];

const PAGE_SIZE = 60;

// How the deck panel arranges its rows. Grouping applies to the main deck,
// which is the only zone big enough to need it; the sort applies to every zone.
const GROUP_MODES = [
  { id: 'type', label: 'By Type' },
  { id: 'energy', label: 'By Energy' },
  { id: 'domain', label: 'By Domain' },
  { id: 'none', label: 'No Grouping' },
];

const SORT_MODES = [
  { id: 'energy', label: 'Energy' },
  { id: 'name', label: 'Name' },
  { id: 'might', label: 'Might' },
  { id: 'price', label: 'Price' },
  { id: 'count', label: 'Copies' },
];

// Every control the filter modal owns, in one object so the pool memo, the
// per-option counts and the Reset button all read from a single source.
const DEFAULT_FILTERS = {
  colors: [],
  type: 'any',
  cost: 'any',
  power: 'any',
  might: 'any',
  rarity: 'any',
  set: 'any',
  keyword: 'any',
  tag: 'any',
  supertype: 'any',
  legality: 'any',
  errata: 'any',
  availableOnly: false,
  ownedOnly: false,
  search: '',
};

// Search stays on the bar rather than in the modal, so it does not count
// towards the badge on the trigger button.
const BADGE_KEYS = Object.keys(DEFAULT_FILTERS).filter((k) => k !== 'search');

// A stat bucket as the counting pass wants it. A card with no value for the stat
// belongs to no bucket, which is not the same as belonging to the "0" one.
const bucketOf = (bucket) => (bucket == null ? [] : [bucket]);

function activeFilterCount(filters) {
  return BADGE_KEYS.filter((k) =>
    k === 'colors' ? filters.colors.length > 0 : filters[k] !== DEFAULT_FILTERS[k]
  ).length;
}

export default function DeckBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { cards, cardsById, ownedIndex, keywordIndex, inDeckIndex, tags, wishlist, reloadDecks } =
    useApp();

  const [deck, setDeck] = useState(emptyDeck);
  const [loadingDeck, setLoadingDeck] = useState(!!id);
  const [tab, setTab] = useState('all');
  const [target, setTarget] = useState('auto');
  const [panelTab, setPanelTab] = useState('deck');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [groupMode, setGroupMode] = useState('type');
  const [sortMode, setSortMode] = useState('energy');
  const [sortDir, setSortDir] = useState(1);
  // The card the ⤢ button opened. Held as an id so the popup keeps following
  // the card data rather than a snapshot taken when it opened.
  const [detailId, setDetailId] = useState(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!id) {
      setDeck(emptyDeck());
      return;
    }
    setLoadingDeck(true);
    api
      .getDeck(id)
      .then((d) => setDeck({ ...emptyDeck(), ...d }))
      .catch(() => navigate('/deckbuilder'))
      .finally(() => setLoadingDeck(false));
  }, [id]);

  const setNames = useMemo(() => setNameOptions(cards), [cards]);

  const legendCard = deck.legend ? cardsById.get(deck.legend) : null;

  const updateFilters = (patch) => setFilters((f) => ({ ...f, ...patch }));

  // The domain row follows the legend: with one chosen, withinLegendDomains
  // already limits the pool to its two domains, so no other option could match.
  const filterDomains = useMemo(
    () =>
      legendCard
        ? (legendCard.colors || []).filter((c) => c !== 'Colorless')
        : COLORS.filter((c) => c !== 'Colorless'),
    [legendCard]
  );

  // Swapping the legend can strand a domain the new one does not have, which
  // would empty the pool from a control that is no longer on screen.
  useEffect(() => {
    setFilters((f) =>
      f.colors.every((c) => filterDomains.includes(c))
        ? f
        : { ...f, colors: f.colors.filter((c) => filterDomains.includes(c)) }
    );
  }, [filterDomains]);

  // Everything the modal has no control for: the pool's own legality rules, the
  // zone tab strip and the search box. Split out so the per-option counts below
  // only re-test the controls the modal owns.
  const baseList = useMemo(
    () =>
      cards.filter((card) => {
        if (isToken(card)) return false;
        if (!isBasePrinting(card)) return false;
        if (!signatureAllowed(card, legendCard)) return false;
        if (!withinLegendDomains(card, legendCard)) return false;
        if (tab === 'legend' && card.type !== 'Legend') return false;
        if (tab === 'champion' && !championMatchesLegend(card, legendCard)) return false;
        if (tab === 'maindeck' && !['Unit', 'Spell', 'Gear'].includes(card.type)) return false;
        if (tab === 'battlefields' && card.type !== 'Battlefield') return false;
        if (tab === 'runes' && card.type !== 'Rune') return false;
        if (!cardMatchesText(card, filters.search)) return false;
        return true;
      }),
    [cards, legendCard, tab, filters.search]
  );

  // Cards this deck cannot take another copy of, behind the "Available to add"
  // toggle. Null unless the toggle is on or the modal is open (which needs it
  // for that option's count) — that is what keeps the pool from recomputing on
  // every add and remove. addCard swaps the Legend and the Chosen Champion
  // rather than refusing, so a legend is always still addable.
  const atLimitIds = useMemo(() => {
    if (!filters.availableOnly && !showFilters) return null;
    const held = new Map();
    for (const { cardId, count } of deckEntries(deck)) {
      held.set(cardId, (held.get(cardId) || 0) + count);
    }
    const ids = new Set();
    for (const [cardId, n] of held) {
      const card = cardsById.get(cardId);
      if (!card || card.type === 'Legend') continue;
      if (n >= deckCopyLimit(card)) ids.add(cardId);
    }
    return ids;
  }, [filters.availableOnly, showFilters, deck, cardsById]);

  // One entry per control the modal owns. `test` is that control at its current
  // value, `buckets` the options a card would answer to. Keeping the pair
  // together is what lets one pass produce both the pool and every count.
  const filterGroups = useMemo(() => {
    const f = filters;
    return [
      {
        key: 'colors',
        test: (c) => f.colors.length === 0 || f.colors.some((x) => (c.colors || []).includes(x)),
        buckets: (c) => (c.colors || []).filter((x) => x !== 'Colorless'),
      },
      { key: 'type', test: (c) => matchesType(c, f.type), buckets: (c) => (c.type ? [c.type] : []) },
      // The stat groups all read lib/cards.js for BOTH halves of the pair: the
      // matcher decides the pool, the bucket helper decides which option's count
      // a card lands in. Sharing one definition is what stops a count appearing
      // beside an option that filters to something else.
      { key: 'cost', test: (c) => matchesCost(c, f.cost), buckets: (c) => bucketOf(energyBucket(c)) },
      { key: 'power', test: (c) => matchesPower(c, f.power), buckets: (c) => bucketOf(powerBucket(c)) },
      { key: 'might', test: (c) => matchesMight(c, f.might), buckets: (c) => bucketOf(mightBucket(c)) },
      {
        key: 'rarity',
        test: (c) => f.rarity === 'any' || c.rarity === f.rarity,
        buckets: (c) => (c.rarity ? [c.rarity] : []),
      },
      {
        key: 'set',
        test: (c) => f.set === 'any' || c.setCode === f.set,
        buckets: (c) => (c.setCode ? [c.setCode] : []),
      },
      {
        key: 'legality',
        test: (c) => f.legality === 'any' || (f.legality === 'banned' ? !!c.banned : !c.banned),
        buckets: (c) => [c.banned ? 'banned' : 'legal'],
      },
      {
        key: 'available',
        // atLimitIds is also built while the modal is merely open, so the test
        // has to read the toggle rather than the set's presence.
        test: (c) => !f.availableOnly || !atLimitIds?.has(c.id),
        buckets: (c) => (atLimitIds?.has(c.id) ? [] : ['on']),
      },
      {
        key: 'owned',
        test: (c) => !f.ownedOnly || ownedAcrossPrintings(c, ownedIndex).total > 0,
        buckets: (c) => (ownedAcrossPrintings(c, ownedIndex).total > 0 ? ['on'] : []),
      },
      // The four dropdowns. The mockup shows no counts beside them, so they
      // only have to take part in the exclusion logic.
      { key: 'supertype', test: (c) => matchesSupertype(c, f.supertype), buckets: () => [] },
      {
        key: 'errata',
        test: (c) => f.errata === 'any' || (f.errata === 'yes' ? !!c.errata : !c.errata),
        buckets: () => [],
      },
      {
        key: 'keyword',
        test: (c) => f.keyword === 'any' || !!keywordIndex.byCard.get(c.id)?.has(f.keyword),
        buckets: () => [],
      },
      {
        key: 'tag',
        test: (c) => matchesTagFilter(c, f.tag, { tags, wishlist, inDeckIndex }),
        buckets: () => [],
      },
    ];
  }, [filters, atLimitIds, ownedIndex, keywordIndex, tags, wishlist, inDeckIndex]);

  const pool = useMemo(() => {
    const list = baseList.filter((card) => filterGroups.every((g) => g.test(card)));
    // Each rune is reprinted as a base printing in every set, so without this
    // the Runes tab shows the same six runes four times over.
    const unique = dedupeByIdentity(list);
    unique.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.name.localeCompare(b.name));
    return unique;
  }, [baseList, filterGroups]);

  // Live match counts. The number beside an option is what picking it would
  // leave, so every filter EXCEPT its own group is applied — recomputing the
  // pool once per option would mean ~40 passes over ~940 cards per keystroke.
  //
  // One pass instead: a card that fails no group belongs in every group's
  // counts, one that fails exactly one belongs only in that group's, and two
  // failures make it nobody's. Buckets hold card identities rather than cards
  // so the counts agree with the deduped pool, where the six runes collapse
  // from their four reprints.
  const poolCounts = useMemo(() => {
    const byGroup = filterGroups.map(() => new Map());
    for (const card of baseList) {
      let failed = -1;
      let fails = 0;
      for (let i = 0; i < filterGroups.length; i++) {
        if (filterGroups[i].test(card)) continue;
        fails += 1;
        if (fails > 1) break;
        failed = i;
      }
      if (fails > 1) continue;
      const identity = cardIdentity(card);
      for (let i = 0; i < filterGroups.length; i++) {
        if (fails === 1 && i !== failed) continue;
        const values = byGroup[i];
        for (const value of filterGroups[i].buckets(card)) {
          let seen = values.get(value);
          if (!seen) values.set(value, (seen = new Set()));
          seen.add(identity);
        }
      }
    }
    const counts = {};
    filterGroups.forEach((g, i) => {
      const out = {};
      for (const [value, seen] of byGroup[i]) out[value] = seen.size;
      counts[g.key] = out;
    });
    return counts;
  }, [baseList, filterGroups]);

  const apiTags = useMemo(() => allApiTags(cards), [cards]);
  const customTags = useMemo(() => allCustomTags(tags), [tags]);
  const activeFilters = activeFilterCount(filters);

  useEffect(() => setVisibleCount(PAGE_SIZE), [filters, tab, legendCard]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((v) => Math.min(v + PAGE_SIZE, pool.length));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [pool.length]);

  const inDeckCount = (cardId) => {
    let n = 0;
    if (deck.legend === cardId) n += 1;
    if (deck.champion === cardId) n += 1;
    for (const zone of Object.keys(ZONES)) n += deck[zone]?.[cardId] || 0;
    return n;
  };

  const problems = deckValidation(deck, cardsById);
  const sigCount = signatureCount(deck, cardsById);

  const save = async () => {
    setSaveState('saving');
    try {
      let saved;
      if (deck.id) saved = await api.updateDeck(deck.id, deck);
      else saved = await api.createDeck(deck);
      setDeck(saved);
      setSaveState('saved');
      // The collection page's [In Deck] chip reads from the shared deck list.
      reloadDecks();
      setTimeout(() => setSaveState(''), 1500);
      if (!id) navigate(`/deckbuilder/${saved.id}`, { replace: true });
    } catch (e) {
      setSaveState(`error: ${e.message}`);
    }
  };

  if (loadingDeck) return <div className="page-loading">Loading deck…</div>;

  const championCard = deck.champion ? cardsById.get(deck.champion) : null;

  return (
    <div>
      <div className="builder-header">
        <div>
          <h1 className="page-title">Deck Builder</h1>
          <p className="page-sub">
            Click a card to add it, right-click to remove it. In the deck panel ↑ and ↓ move a copy
            along bench → sideboard → main deck, and ⤢ opens the full card.
          </p>
        </div>

        <div className="deck-actions">
          <button className="primary" onClick={save}>
            {deck.id ? 'Save deck' : 'Save as new deck'}
          </button>
          {deck.id && <button onClick={() => navigate(`/decks/view/${deck.id}`)}>View</button>}
          <button onClick={() => setShowImport(true)}>Import</button>
          <button onClick={() => setShowExport(true)}>Export</button>
          <button
            className="danger"
            onClick={() => setDeck((d) => ({ ...emptyDeck(), id: d.id, name: d.name }))}
          >
            Clear
          </button>
          {saveState && <span className="muted save-state">{saveState}</span>}
        </div>
      </div>

      <div className="builder-layout">
        <div>
          <div className="pool-tabs">
            {POOL_TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="spacer" style={{ flex: 1 }} />
            <label className="inline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="muted">Add to:</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="auto">Auto</option>
                <option value="champion">Chosen Champion</option>
                <option value="main">Main Deck</option>
                <option value="side">Sideboard</option>
                <option value="bench">The Bench</option>
              </select>
            </label>
          </div>

          {/* Search stays out here because it is typed at, not picked from. The
              rest of the wall of selects this used to be now lives in the
              modal, with the badge saying how many of them are set. */}
          <div className="pool-controls">
            <input
              type="search"
              placeholder="Search…"
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
            />
            <button
              className={`filter-trigger ${activeFilters > 0 ? 'on' : ''}`}
              onClick={() => setShowFilters(true)}
            >
              Filter cards
              {activeFilters > 0 && <span className="filter-badge">{activeFilters}</span>}
            </button>
            {activeFilters > 0 && (
              <button
                onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, search: f.search }))}
              >
                Reset
              </button>
            )}
            <span className="count-note">{pool.length} cards</span>
            {legendCard && (
              <span className="count-note">· {(legendCard.colors || []).join('/')} domains</span>
            )}
          </div>

          {showFilters && (
            <DeckFilterModal
              filters={filters}
              onChange={updateFilters}
              onReset={() => setFilters((f) => ({ ...DEFAULT_FILTERS, search: f.search }))}
              onClose={() => setShowFilters(false)}
              counts={poolCounts}
              domains={filterDomains}
              hasLegend={!!legendCard}
              setNames={setNames}
              keywordOptions={keywordIndex.all}
              customTags={customTags}
              apiTags={apiTags}
            />
          )}

          {tab === 'champion' && !legendCard && (
            <div className="empty-zone" style={{ margin: '8px 0' }}>
              Pick a Legend first — the Chosen Champion has to be that legend's own champion.
            </div>
          )}

          <div className="pool-grid">
            {pool.slice(0, visibleCount).map((card) => {
              const count = inDeckCount(card.id);
              const owned = ownedAcrossPrintings(card, ownedIndex).total;
              return (
                <div
                  key={card.id}
                  className="pool-card"
                  title={`${card.name} — click to add, right-click to remove`}
                  onClick={() => setDeck((d) => addCard(d, card, target, cardsById))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const zone =
                      card.type === 'Legend'
                        ? 'legend'
                        : deck.champion === card.id
                          ? 'champion'
                          : card.type === 'Battlefield'
                            ? 'battlefields'
                            : card.type === 'Rune'
                              ? 'runes'
                              : deck.main[card.id]
                                ? 'main'
                                : deck.side[card.id]
                                  ? 'side'
                                  : 'bench';
                    setDeck((d) => removeCard(d, card.id, zone));
                  }}
                >
                  <img src={card.image} alt={card.name} loading="lazy" decoding="async" />
                  {count > 0 && <span className="in-deck">{count}</span>}
                  {card.banned && <span className="banned-tag">BANNED</span>}
                  <span className={`owned-tag ${owned > 0 ? 'some' : 'none'}`}>
                    {owned > 0 ? `own ${owned}` : 'unowned'}
                  </span>
                </div>
              );
            })}
          </div>
          {visibleCount < pool.length && (
            <div className="load-more" ref={sentinelRef}>
              Loading more…
            </div>
          )}
        </div>

        <aside className="deck-panel">
          <input
            className="deck-name-input"
            value={deck.name}
            onChange={(e) => setDeck((d) => ({ ...d, name: e.target.value }))}
            placeholder="Deck name"
          />

          <DeckTabs value={panelTab} onChange={setPanelTab} />

          {panelTab === 'deck' && (
            <>
              <div className="zone">
                <div className="zone-head">
                  <span>Legend</span>
                  <span className={`cnt ${deck.legend ? 'ok' : ''}`}>{deck.legend ? 1 : 0}/1</span>
                </div>
                {legendCard ? (
                  <div className="deck-cards">
                    <DeckCardRow
                      card={legendCard}
                      cardId={legendCard.id}
                      count={1}
                      onRemove={() => setDeck((d) => removeCard(d, legendCard.id, 'legend'))}
                      onExpand={() => setDetailId(legendCard.id)}
                    />
                  </div>
                ) : (
                  <div className="empty-zone">Pick a Legend from the pool</div>
                )}
              </div>

              <div className="zone">
                <div className="zone-head">
                  <span>Chosen Champion</span>
                  <span className={`cnt ${deck.champion ? 'ok' : ''}`}>
                    {deck.champion ? 1 : 0}/1
                  </span>
                </div>
                {championCard ? (
                  <div className="deck-cards">
                    <DeckCardRow
                      card={championCard}
                      cardId={championCard.id}
                      count={1}
                      onRemove={() => setDeck((d) => removeCard(d, championCard.id, 'champion'))}
                      onExpand={() => setDetailId(championCard.id)}
                    />
                  </div>
                ) : (
                  <div className="empty-zone">
                    {legendCard
                      ? `Add a ${championOf(legendCard)} champion unit (auto-fills this slot)`
                      : 'Pick a Legend first'}
                  </div>
                )}
              </div>

              {Object.entries(ZONES).map(([zoneId, zoneDef]) => (
                <ZoneList
                  key={zoneId}
                  zoneId={zoneId}
                  zoneDef={zoneDef}
                  deck={deck}
                  cardsById={cardsById}
                  groupMode={zoneId === 'main' ? groupMode : 'none'}
                  sortMode={sortMode}
                  sortDir={sortDir}
                  controls={
                    zoneId === 'main' ? (
                      <div className="deck-arrange">
                        <select value={groupMode} onChange={(e) => setGroupMode(e.target.value)}>
                          {GROUP_MODES.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                          {SORT_MODES.map((s) => (
                            <option key={s.id} value={s.id}>
                              ⇅ {s.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="dir-btn"
                          title={sortDir === 1 ? 'Ascending' : 'Descending'}
                          onClick={() => setSortDir((d) => -d)}
                        >
                          {sortDir === 1 ? '↑' : '↓'}
                        </button>
                      </div>
                    ) : null
                  }
                  onAdd={(card) => setDeck((d) => addCard(d, card, zoneId, cardsById))}
                  onRemove={(cardId) => setDeck((d) => removeCard(d, cardId, zoneId))}
                  onMove={(cardId, dir) =>
                    setDeck((d) => moveCard(d, cardId, zoneId, dir, cardsById))
                  }
                  onExpand={setDetailId}
                />
              ))}

              {sigCount > 0 && (
                <div className="zone-head">
                  <span>Signature cards</span>
                  <span className={`cnt ${sigCount > MAX_SIGNATURE_CARDS ? 'over' : 'ok'}`}>
                    {sigCount}/{MAX_SIGNATURE_CARDS}
                  </span>
                </div>
              )}

              {problems.length > 0 && (
                <div className="muted" style={{ fontSize: 12 }}>
                  {problems.map((p) => (
                    <div key={p}>⚠ {p}</div>
                  ))}
                </div>
              )}
            </>
          )}

          {panelTab === 'stats' && <DeckStats deck={deck} />}
          {panelTab === 'collection' && <DeckCollectionList deck={deck} />}
        </aside>
      </div>

      {showExport && (
        <DeckExportModal deck={deck} cardsById={cardsById} onClose={() => setShowExport(false)} />
      )}
      {detailId && (
        <CardDetailModal card={cardsById.get(detailId)} onClose={() => setDetailId(null)} />
      )}
      {showImport && (
        <ImportDeckDialog
          cardsById={cardsById}
          onClose={() => setShowImport(false)}
          onImport={(imported) => {
            setDeck((d) => ({ ...imported, id: d.id }));
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

// One card in the deck panel: thumbnail, a stepper, and the two ladder arrows.
// A card id a deck names but the database does not have still renders, minus
// the parts that need card data — an import must never lose a line silently.
function DeckCardRow({
  card,
  cardId,
  count,
  onAdd,
  onRemove,
  onMove,
  canUp,
  canDown,
  onExpand,
}) {
  const name = card?.name || cardId;
  return (
    <div className={`deck-card ${card ? '' : 'missing'}`}>
      {card ? (
        <button className="dc-thumb" onClick={onExpand} title={`${name} — click to enlarge`}>
          <img src={card.image} alt={name} loading="lazy" decoding="async" />
        </button>
      ) : (
        <span className="dc-thumb empty">?</span>
      )}

      <div className="dc-steps">
        {onAdd && (
          <button onClick={onAdd} title="Add a copy" disabled={!card}>
            +
          </button>
        )}
        <button onClick={onRemove} title="Remove a copy">
          −
        </button>
      </div>

      <div className="dc-main">
        <div className="dc-name" title={card ? name : `${cardId} — not in the card database`}>
          {name}
        </div>
        <div className="dc-meta">
          <span className="dc-count">{count}x</span>
          {card?.cost != null && (
            <span className="rb-icon energy" title={`${card.cost} energy`}>
              {card.cost}
            </span>
          )}
          {/* The POWER cost, drawn as one domain symbol per point -- this row
              used to show a colourless diamond per domain, which said nothing
              about what the card actually costs to play. */}
          {card && <PowerCost card={card} />}
          {card?.might != null && (
            <span className="dc-might" title={`${card.might} might`}>
              {card.might}
              <span className="rb-icon might">⚔</span>
            </span>
          )}
          <span className="dc-spacer" />
          {onMove && (
            <>
              <button
                className="dc-btn"
                disabled={!canUp}
                title="Move a copy up: bench → sideboard → main deck"
                onClick={() => onMove(cardId, 1)}
              >
                ↑
              </button>
              <button
                className="dc-btn"
                disabled={!canDown}
                title="Move a copy down: main deck → sideboard → bench"
                onClick={() => onMove(cardId, -1)}
              >
                ↓
              </button>
            </>
          )}
          {card && (
            <button className="dc-btn" title="Enlarge" onClick={onExpand}>
              ⤢
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Sort keys per row. A card with no value for the chosen key (a spell has no
// might, an unpriced printing no price) sorts last in both directions rather
// than pretending to be zero, the same rule lib/cards.js applies to prices.
const ROW_KEY = {
  energy: (r) => r.card?.cost ?? null,
  might: (r) => r.card?.might ?? null,
  price: (r) => (r.card ? effectivePrice(r.card) : null),
  count: (r) => r.n,
  name: () => null,
};

function rowName(r) {
  return r.card?.name || r.cardId;
}

function rowSorter(mode, dir) {
  const key = ROW_KEY[mode] || ROW_KEY.energy;
  return (a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb != null) return 1;
    if (kb == null && ka != null) return -1;
    if (ka != null && kb != null && ka !== kb) return (ka - kb) * dir;
    return rowName(a).localeCompare(rowName(b)) * (mode === 'name' ? dir : 1);
  };
}

function groupRows(rows, mode, dir) {
  if (mode === 'type') {
    return MAIN_GROUPS.map(({ label, types }) => ({
      label,
      rows: rows.filter((r) => inMainGroup(r.card, types)),
    })).filter((g) => g.rows.length > 0);
  }
  if (mode === 'energy' || mode === 'domain') {
    const labelOf =
      mode === 'energy'
        ? (r) => (r.card?.cost == null ? 'No energy' : `Energy ${r.card.cost}`)
        : (r) => (r.card?.colors || []).join(' / ') || 'Colorless';
    const buckets = new Map();
    for (const r of rows) {
      const label = labelOf(r);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(r);
    }
    const groups = [...buckets.entries()].map(([label, rs]) => ({ label, rows: rs }));
    // "No energy" starts with N, so it lands after every "Energy n" bucket.
    groups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    if (mode === 'energy' && dir < 0) groups.reverse();
    return groups;
  }
  return [{ label: null, rows }];
}

function ZoneList({
  zoneId,
  zoneDef,
  deck,
  cardsById,
  groupMode,
  sortMode,
  sortDir,
  controls,
  onAdd,
  onRemove,
  onMove,
  onExpand,
}) {
  const count = zoneCount(deck[zoneId]);
  // The champion is one of the 40, so the main zone itself holds 39.
  const max = zoneId === 'main' ? mainTarget(deck) : zoneDef.max;
  const status = max == null ? '' : count === max ? 'ok' : count > max ? 'over' : '';
  const onLadder = ZONE_LADDER.includes(zoneId);
  const sorted = Object.entries(deck[zoneId] || {})
    .map(([cardId, n]) => ({ card: cardsById.get(cardId), cardId, n }))
    .sort(rowSorter(sortMode, sortDir));
  const groups = groupRows(sorted, groupMode, sortDir);

  return (
    <div className="zone">
      <div className="zone-head">
        <span>{zoneDef.label}</span>
        <span className={`cnt ${status}`}>
          {count}
          {max != null ? `/${max}` : ''}
        </span>
      </div>
      {controls}
      {zoneId === 'main' && deck.champion && (
        <div className="zone-note">{count + 1}/{ZONES.main.max} with the champion</div>
      )}
      {sorted.length === 0 && <div className="empty-zone">Empty</div>}
      {groups.map((g) => (
        <div key={g.label || 'all'}>
          {g.label && (
            <div className="deck-group-head">
              <span>{g.label}</span>
              <span>{g.rows.reduce((s, r) => s + r.n, 0)} cards</span>
            </div>
          )}
          <div className="deck-cards">
            {g.rows.map(({ card, cardId, n }) => (
              <DeckCardRow
                key={cardId}
                card={card}
                cardId={cardId}
                count={n}
                onAdd={card ? () => onAdd(card) : null}
                onRemove={() => onRemove(cardId)}
                onMove={onLadder ? onMove : null}
                canUp={onLadder && canMoveCard(deck, cardId, zoneId, 1, cardsById)}
                canDown={onLadder && canMoveCard(deck, cardId, zoneId, -1, cardsById)}
                onExpand={() => onExpand(cardId)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImportDeckDialog({ cardsById, onClose, onImport }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return parseDeckText(text, cardsById);
  }, [text, cardsById]);

  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(file);
  };

  return (
    <Modal title="Import deck" onClose={onClose}>
      <p className="muted">
        Format: section headers like Legend:, Champion:, MainDeck:, Battlefields:, Runes:,
        Sideboard:, then lines of “count Card Name”. Card ids work too. Lines starting with # are
        comments, and the first one names the deck.
      </p>
      <input type="file" accept=".txt,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      {parsed && (
        <div className="import-preview">
          <div className={parsed.matched === 0 ? 'warn' : ''}>
            {parsed.matched} lines matched
            {parsed.unmatched.length > 0 ? `, ${parsed.unmatched.length} not recognized:` : ''}
          </div>
          {parsed.unmatched.length > 0 && (
            <div className="unmatched-list">
              {parsed.unmatched.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        {/* Importing a deck replaces the current one, so a parse that matched
            nothing must not be allowed to wipe it. */}
        <button
          className="primary"
          disabled={!parsed || parsed.matched === 0}
          onClick={() => onImport(parsed.deck)}
        >
          Import
        </button>
      </div>
    </Modal>
  );
}
