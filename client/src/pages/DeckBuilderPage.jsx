import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import Modal from '../components/Modal.jsx';
import DeckStats from '../components/DeckStats.jsx';
import DeckCollectionList from '../components/DeckCollectionList.jsx';
import {
  COLORS,
  COLOR_HEX,
  MIGHT_BUCKETS,
  RARITIES,
  SUPERTYPES,
  cardMatchesText,
  championMatchesLegend,
  championOf,
  dedupeByIdentity,
  isBasePrinting,
  isToken,
  matchesMight,
  ownedAcrossPrintings,
  setLabel,
  signatureAllowed,
  withinLegendDomains,
} from '../lib/cards.js';
import {
  MAX_SIGNATURE_CARDS,
  ZONES,
  addCard,
  emptyDeck,
  exportDeckText,
  mainTarget,
  parseDeckText,
  removeCard,
  deckValidation,
  signatureCount,
  zoneCount,
} from '../lib/deck.js';

const POOL_TABS = [
  { id: 'all', label: 'All' },
  { id: 'legend', label: 'Legends' },
  { id: 'champion', label: 'Champion' },
  { id: 'maindeck', label: 'Main Deck' },
  { id: 'battlefields', label: 'Battlefields' },
  { id: 'runes', label: 'Runes' },
];

const PAGE_SIZE = 60;

export default function DeckBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { cards, cardsById, ownedIndex, keywordIndex, reloadDecks } = useApp();

  const [deck, setDeck] = useState(emptyDeck);
  const [loadingDeck, setLoadingDeck] = useState(!!id);
  const [tab, setTab] = useState('all');
  const [target, setTarget] = useState('auto');
  const [panelTab, setPanelTab] = useState('deck');
  const [search, setSearch] = useState('');
  const [colors, setColors] = useState([]);
  const [setFilter, setSetFilter] = useState('any');
  const [rarity, setRarity] = useState('any');
  const [cost, setCost] = useState('any');
  const [might, setMight] = useState('any');
  const [keyword, setKeyword] = useState('any');
  const [supertype, setSupertype] = useState('any');
  const [legality, setLegality] = useState('any');
  const [errata, setErrata] = useState('any');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [saveState, setSaveState] = useState('');
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

  const setNames = useMemo(() => {
    const seen = new Map();
    for (const c of cards) if (!seen.has(c.setCode)) seen.set(c.setCode, setLabel(c));
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards]);

  const legendCard = deck.legend ? cardsById.get(deck.legend) : null;

  const pool = useMemo(() => {
    const list = cards.filter((card) => {
      if (isToken(card)) return false;
      if (!isBasePrinting(card)) return false;
      if (!signatureAllowed(card, legendCard)) return false;
      if (!withinLegendDomains(card, legendCard)) return false;
      if (ownedOnly && ownedAcrossPrintings(card, ownedIndex).total === 0) return false;
      if (tab === 'legend' && card.type !== 'Legend') return false;
      if (tab === 'champion' && !championMatchesLegend(card, legendCard)) return false;
      if (tab === 'maindeck' && !['Unit', 'Spell', 'Gear'].includes(card.type)) return false;
      if (tab === 'battlefields' && card.type !== 'Battlefield') return false;
      if (tab === 'runes' && card.type !== 'Rune') return false;
      if (setFilter !== 'any' && card.setCode !== setFilter) return false;
      if (rarity !== 'any' && card.rarity !== rarity) return false;
      if (supertype !== 'any' && card.supertype !== supertype) return false;
      if (!matchesMight(card, might)) return false;
      if (cost !== 'any') {
        if (cost === '7+' ? !(card.cost >= 7) : card.cost !== Number(cost)) return false;
      }
      if (legality !== 'any') {
        if (legality === 'banned' ? !card.banned : card.banned) return false;
      }
      if (errata !== 'any') {
        const hasErrata = !!card.errata;
        if (errata === 'yes' ? !hasErrata : hasErrata) return false;
      }
      if (keyword !== 'any' && !keywordIndex.byCard.get(card.id)?.has(keyword)) return false;
      if (colors.length > 0 && !colors.some((c) => (card.colors || []).includes(c)))
        return false;
      if (!cardMatchesText(card, search)) return false;
      return true;
    });
    // Each rune is reprinted as a base printing in every set, so without this
    // the Runes tab shows the same six runes four times over.
    const unique = dedupeByIdentity(list);
    unique.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.name.localeCompare(b.name));
    return unique;
  }, [
    cards,
    tab,
    setFilter,
    rarity,
    cost,
    colors,
    search,
    legendCard,
    ownedOnly,
    ownedIndex,
    might,
    keyword,
    supertype,
    legality,
    errata,
    keywordIndex,
  ]);

  useEffect(
    () => setVisibleCount(PAGE_SIZE),
    [tab, setFilter, rarity, cost, colors, search, legendCard, ownedOnly, might, keyword, supertype, legality, errata]
  );

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
      <h1 className="page-title">Deck Builder</h1>
      <p className="page-sub">
        Click a card to add it. Right-click a card in the pool (or use − in the deck panel) to
        remove it.
      </p>

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

          <div className="filter-bar">
            <div className="color-chips">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-chip ${colors.includes(color) ? 'on' : ''}`}
                  style={{ background: COLOR_HEX[color] }}
                  title={color}
                  onClick={() =>
                    setColors((cs) =>
                      cs.includes(color) ? cs.filter((c) => c !== color) : [...cs, color]
                    )
                  }
                >
                  {color[0]}
                </button>
              ))}
            </div>
            <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)}>
              <option value="any">Set: Any</option>
              {setNames.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} — {name}
                </option>
              ))}
            </select>
            <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
              <option value="any">Rarity: Any</option>
              {RARITIES.filter((r) => r !== 'Showcase').map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select value={cost} onChange={(e) => setCost(e.target.value)}>
              <option value="any">Energy: Any</option>
              {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                <option key={c} value={c}>
                  Energy: {c}
                </option>
              ))}
              <option value="7+">Energy: 7+</option>
            </select>

            <select value={might} onChange={(e) => setMight(e.target.value)}>
              <option value="any">Might: Any</option>
              {MIGHT_BUCKETS.map((m) => (
                <option key={m} value={m}>
                  Might: {m}
                </option>
              ))}
            </select>

            <select value={supertype} onChange={(e) => setSupertype(e.target.value)}>
              <option value="any">Super type: Any</option>
              {SUPERTYPES.filter((s) => s !== 'Token').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select value={keyword} onChange={(e) => setKeyword(e.target.value)}>
              <option value="any">Keyword: Any</option>
              {keywordIndex.all.map(([kw, n]) => (
                <option key={kw} value={kw}>
                  {kw} ({n})
                </option>
              ))}
            </select>

            <select value={legality} onChange={(e) => setLegality(e.target.value)}>
              <option value="any">Legality: Any</option>
              <option value="legal">Legal only</option>
              <option value="banned">Banned only</option>
            </select>

            <select value={errata} onChange={(e) => setErrata(e.target.value)}>
              <option value="any">Errata: Any</option>
              <option value="yes">Has errata</option>
              <option value="no">No errata</option>
            </select>
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="inline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={ownedOnly}
                onChange={(e) => setOwnedOnly(e.target.checked)}
              />
              Owned only
            </label>
            <span className="count-note">{pool.length} cards</span>
            {legendCard && (
              <span className="count-note">
                · {(legendCard.colors || []).join('/')} domains
              </span>
            )}
          </div>

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

          <div className="deck-tabs">
            <button className={panelTab === 'deck' ? 'on' : ''} onClick={() => setPanelTab('deck')}>
              Deck
            </button>
            <button
              className={panelTab === 'stats' ? 'on' : ''}
              onClick={() => setPanelTab('stats')}
            >
              Stats
            </button>
            <button
              className={panelTab === 'collection' ? 'on' : ''}
              onClick={() => setPanelTab('collection')}
            >
              Collection
            </button>
          </div>

          {panelTab === 'deck' && (
            <>
              <div className="zone">
                <div className="zone-head">
                  <span>Legend</span>
                  <span className={`cnt ${deck.legend ? 'ok' : ''}`}>{deck.legend ? 1 : 0}/1</span>
                </div>
                {legendCard ? (
                  <SlotLine
                    card={legendCard}
                    onRemove={() => setDeck((d) => removeCard(d, legendCard.id, 'legend'))}
                  />
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
                  <SlotLine
                    card={championCard}
                    onRemove={() => setDeck((d) => removeCard(d, championCard.id, 'champion'))}
                  />
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
                  onAdd={(card) => setDeck((d) => addCard(d, card, zoneId, cardsById))}
                  onRemove={(cardId) => setDeck((d) => removeCard(d, cardId, zoneId))}
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

          <div className="deck-actions">
            <button className="primary" onClick={save}>
              {deck.id ? 'Save deck' : 'Save as new deck'}
            </button>
            {deck.id && (
              <button onClick={() => navigate(`/decks/view/${deck.id}`)}>View</button>
            )}
            <button onClick={() => setShowImport(true)}>Import</button>
            <button onClick={() => setShowExport(true)}>Export</button>
            <button
              className="danger"
              onClick={() => setDeck((d) => ({ ...emptyDeck(), id: d.id, name: d.name }))}
            >
              Clear
            </button>
          </div>
          {saveState && <div className="muted" style={{ marginTop: 6 }}>{saveState}</div>}
        </aside>
      </div>

      {showExport && (
        <Modal title="Export deck" onClose={() => setShowExport(false)}>
          <textarea readOnly value={exportDeckText(deck, cardsById)} onFocus={(e) => e.target.select()} />
          <div className="modal-actions">
            <button
              onClick={() => navigator.clipboard.writeText(exportDeckText(deck, cardsById))}
            >
              Copy to clipboard
            </button>
            <button onClick={() => setShowExport(false)}>Close</button>
          </div>
        </Modal>
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

function SlotLine({ card, onRemove }) {
  return (
    <div className="legend-slot">
      <img src={card.image} alt={card.name} loading="lazy" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tile-name">{card.name}</div>
        <div className="muted" style={{ fontSize: 11 }}>
          {card.id}
        </div>
      </div>
      <button onClick={onRemove}>✕</button>
    </div>
  );
}

// Main-deck grouping. The trailing bucket catches anything an imported deck put
// in the main zone that is not one of the three normal types, so nothing is
// silently missing from the list.
const MAIN_GROUPS = [
  { label: 'Units', types: ['Unit'] },
  { label: 'Spells', types: ['Spell'] },
  { label: 'Gear', types: ['Gear'] },
  { label: 'Other', types: null },
];

function ZoneList({ zoneId, zoneDef, deck, cardsById, onAdd, onRemove }) {
  const entries = Object.entries(deck[zoneId] || {});
  const count = zoneCount(deck[zoneId]);
  // The champion is one of the 40, so the main zone itself holds 39.
  const max = zoneId === 'main' ? mainTarget(deck) : zoneDef.max;
  const status = max == null ? '' : count === max ? 'ok' : count > max ? 'over' : '';
  const sorted = entries
    .map(([cardId, n]) => ({ card: cardsById.get(cardId), cardId, n }))
    .sort(
      (a, b) =>
        (a.card?.cost ?? 99) - (b.card?.cost ?? 99) ||
        (a.card?.name || '').localeCompare(b.card?.name || '')
    );

  const groups =
    zoneId === 'main'
      ? MAIN_GROUPS.map(({ label, types }) => ({
          label,
          rows: sorted.filter((r) =>
            types ? types.includes(r.card?.type) : !['Unit', 'Spell', 'Gear'].includes(r.card?.type)
          ),
        })).filter((g) => g.rows.length > 0)
      : [{ label: null, rows: sorted }];

  const line = ({ card, cardId, n }) => (
    <div className="deck-line" key={cardId}>
      <span className="cost">{card?.cost ?? '·'}</span>
      <span className="nm" title={card?.name || cardId}>
        {card?.name || cardId}
      </span>
      <button onClick={() => onRemove(cardId)}>−</button>
      <span className="lc">{n}</span>
      <button onClick={() => card && onAdd(card)}>+</button>
    </div>
  );

  return (
    <div className="zone">
      <div className="zone-head">
        <span>{zoneDef.label}</span>
        <span className={`cnt ${status}`}>
          {count}
          {max != null ? `/${max}` : ''}
        </span>
      </div>
      {zoneId === 'main' && deck.champion && (
        <div className="zone-note">{count + 1}/{ZONES.main.max} with the champion</div>
      )}
      {sorted.length === 0 && <div className="empty-zone">Empty</div>}
      {groups.map((g) => (
        <div key={g.label || 'all'}>
          {g.label && (
            <div className="deck-group-head">
              <span>{g.label}</span>
              <span>{g.rows.reduce((s, r) => s + r.n, 0)}</span>
            </div>
          )}
          {g.rows.map(line)}
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
