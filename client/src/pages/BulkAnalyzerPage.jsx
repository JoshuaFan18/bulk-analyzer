// Rules: docs/bulk-analyzer.md
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import {
  COLORS,
  METAGAME_PRESETS,
  cardMatchesText,
  isToken,
  money,
  normName,
  setLabel,
  setRank,
} from '../lib/cards.js';
import { csvCell, downloadText } from '../lib/download.js';
import { KEEP_TAG, hasTag } from '../lib/tags.js';
import CardDetailModal from '../components/CardDetailModal.jsx';
import DomainChips from '../components/DomainChips.jsx';

const PREVIEW_W = 260;
const PREVIEW_H = 364;

const DEFAULT_PRICE_LIMIT = 0.2;
const DEFAULT_PLAY_RATE_LIMIT = 10;
// The optional field-popularity test reads the same staples list as the
// Staples analyzer, thus it starts at that page's field default.
const DEFAULT_POPULARITY_LIMIT = 10;

const stripVariant = (id) => String(id).replace(/([0-9])[a-z]$/i, '$1');

// Sorters for the bulk table. A card the meta never plays has playRate 0, which
// is a real answer here (unlike a missing price), so it sorts as zero.
const SORTS = {
  value: (a, b) => b.value - a.value || b.copies - a.copies,
  copies: (a, b) => b.copies - a.copies || b.value - a.value,
  price: (a, b) => b.price - a.price || a.card.name.localeCompare(b.card.name),
  priceAsc: (a, b) => a.price - b.price || a.card.name.localeCompare(b.card.name),
  playRate: (a, b) => b.playRate - a.playRate || b.value - a.value,
  name: (a, b) => a.card.name.localeCompare(b.card.name),
  set: (a, b) =>
    setRank(a.card.setCode) - setRank(b.card.setCode) || a.card.id.localeCompare(b.card.id),
};

// The thumbnail opens the read-only detail popup on a click and a floating
// full-card preview on a hover, so a row can be judged without leaving the
// table.
function CardCell({ card, onOpen, onHover }) {
  return (
    <div className="bulk-card-cell">
      <button
        type="button"
        className="dc-thumb"
        title={`${card.name} — view card details`}
        onClick={() => {
          // The pointer stays on the thumbnail after the click, so the preview
          // has to be dismissed here or it floats over the popup.
          onHover(null);
          onOpen(card.id);
        }}
        onMouseEnter={(e) => onHover(card, e.clientX, e.clientY)}
        onMouseMove={(e) => onHover(card, e.clientX, e.clientY)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(null)}
      >
        {card.image ? (
          <img src={card.image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="muted">?</span>
        )}
      </button>
      <span>
        {card.name} <span className="muted">{card.id}</span>
      </span>
    </div>
  );
}

// The same lock the collection tile uses, so the tag means the same thing on
// both screens. It writes the tag for this printing id only.
function KeepButton({ card, kept, onToggle }) {
  return (
    <button
      type="button"
      className={`keep-cell-btn ${kept ? 'on' : ''}`}
      aria-pressed={kept}
      title={kept ? `Remove the ${KEEP_TAG} tag` : `Tag as ${KEEP_TAG} (never bulk)`}
      onClick={() => onToggle(card.id, KEEP_TAG)}
    >
      🔒
    </button>
  );
}

// Every list on the page shows the same columns, so one table serves all four.
// A locked row needs no styling of its own: the lock moves it into the locked
// list, which says the same thing.
function ResultTable({ rows, showPopularity, onOpen, onHover, onToggleKeep, onRemoveOne, onRemoveAll }) {
  const showRemove = Boolean(onRemoveOne);
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Card</th>
          <th>Set</th>
          <th>Rarity</th>
          <th className="num">Normal copies</th>
          <th className="num">Price</th>
          <th className="num">Value</th>
          <th className="num">Max meta play rate</th>
          {showPopularity ? <th className="num">Field popularity</th> : null}
          <th>{KEEP_TAG}</th>
          {showRemove ? <th>Remove</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.card.id}>
            <td>
              <CardCell card={e.card} onOpen={onOpen} onHover={onHover} />
            </td>
            <td>{e.card.setCode}</td>
            <td>{e.card.rarity}</td>
            <td className="num">{e.copies}</td>
            <td className="num">{money(e.price)}</td>
            <td className="num">{money(e.value)}</td>
            <td className="num">
              {e.playRate > 0 ? `${e.playRate}%` : '—'}
              {e.legend ? <span className="muted"> ({e.legend})</span> : null}
            </td>
            {showPopularity ? (
              <td className="num">{e.popularity != null ? `${e.popularity}%` : '—'}</td>
            ) : null}
            <td>
              <KeepButton card={e.card} kept={e.keep} onToggle={onToggleKeep} />
            </td>
            {showRemove ? (
              <td>
                <div className="bulk-remove-cell">
                  <button
                    type="button"
                    className="danger"
                    title="Remove one normal copy from your collection"
                    onClick={() => onRemoveOne(e.card)}
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title="Remove every normal copy of this card from your collection"
                    onClick={() => onRemoveAll(e.card)}
                  >
                    All
                  </button>
                </div>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// One collapsible list. All four lists on the page are the same shape: a
// heading that says how many rows survived the toolbar out of how many the run
// produced, an explanation of what the list means, and the table. `empty` is the
// text for a list the filters emptied, `noRows` for one the run never filled.
function ResultPanel({ title, rows, total, open, children, empty, noRows, tableProps }) {
  return (
    <details className="panel" open={open}>
      <summary>
        {title} ({rows.length}
        {rows.length !== total ? ` of ${total}` : ''})
      </summary>
      {children}
      {rows.length === 0 ? (
        <p className="muted">{total === 0 ? noRows ?? empty : empty}</p>
      ) : (
        <ResultTable rows={rows} {...tableProps} />
      )}
    </details>
  );
}

export default function BulkAnalyzerPage() {
  const { cards, cardsById, collection, tags, toggleCardTag, setQty, mergeCollection } = useApp();
  const [metagameId, setMetagameId] = useState('1');
  const [customId, setCustomId] = useState('');
  const [priceLimit, setPriceLimit] = useState(String(DEFAULT_PRICE_LIMIT));
  const [playRateLimit, setPlayRateLimit] = useState(String(DEFAULT_PLAY_RATE_LIMIT));
  // The optional field-popularity test. Off by default, so an existing run is
  // unchanged; when on, a card at or above the limit is held out of the bulk
  // list even if the meta decks never play it.
  const [usePopularity, setUsePopularity] = useState(false);
  const [popularityLimit, setPopularityLimit] = useState(String(DEFAULT_POPULARITY_LIMIT));
  const [phase, setPhase] = useState('idle'); // idle | staples | legends | maps | done | error
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // View state for the result table. These never re-run the analysis.
  const [query, setQuery] = useState('');
  // An empty list means every set, so the table is never empty by default and
  // clearing the last box does not hide everything.
  const [setFilter, setSetFilter] = useState([]);
  // Same rule as the sets, and a multi-domain card matches any chip that is on.
  const [domainFilter, setDomainFilter] = useState([]);
  const [rarityFilter, setRarityFilter] = useState('any');
  const [playFilter, setPlayFilter] = useState('any');
  const [minCopies, setMinCopies] = useState('1');
  const [sort, setSort] = useState('value');

  // The id, not the card, so an open popup shows the new price after a refresh.
  const [detailId, setDetailId] = useState(null);
  const [hover, setHover] = useState(null);

  // The preview is fixed to the pointer, so it is clamped to the viewport or a
  // row near an edge would push it off screen.
  const showHover = (card, x, y) => {
    if (!card || !card.image) {
      setHover(null);
      return;
    }
    setHover({
      image: card.image,
      name: card.name,
      x: Math.min(x + 18, window.innerWidth - PREVIEW_W - 8),
      y: Math.min(Math.max(y - PREVIEW_H / 2, 8), window.innerHeight - PREVIEW_H - 8),
    });
  };

  const effectiveId = customId.trim() || metagameId;

  const run = async () => {
    // The staples list is the one extra request, and it comes first so the
    // meta-map progress bar is the last thing the user watches.
    setPhase(usePopularity ? 'staples' : 'legends');
    setError(null);
    setResult(null);
    try {
      // Highest field popularity for each card, keyed the same three ways as the
      // play-rate usage map, because the riftdecks ids do not match the DotGG
      // ids. A card missing from the list is under the list floor, thus a null
      // popularity passes the test rather than failing it.
      let fieldPop = null;
      let staplesSource = null;
      if (usePopularity) {
        const staples = await api.getStaples();
        staplesSource = {
          cardCount: staples.cards.length,
          fetchedAt: staples.fetchedAt,
          minPopularity: staples.minPopularity,
        };
        fieldPop = new Map();
        const recordPop = (key, pop) => {
          if (!key) return;
          const prev = fieldPop.get(key);
          if (prev == null || pop > prev) fieldPop.set(key, pop);
        };
        for (const c of staples.cards) {
          // The collector number and the image disagree for the runes, thus
          // both ids are keys.
          for (const id of [c.cardId, c.imgCardId]) {
            if (!id) continue;
            recordPop(id.toUpperCase(), c.popularity);
            recordPop(stripVariant(id.toUpperCase()), c.popularity);
          }
          recordPop(`n:${normName(c.name)}`, c.popularity);
        }
      }

      const lookupPopularity = (card) => {
        if (!fieldPop) return null;
        const candidates = [
          fieldPop.get(card.id.toUpperCase()),
          fieldPop.get(stripVariant(card.id.toUpperCase())),
          fieldPop.get(`n:${normName(card.name)}`),
        ].filter((v) => v != null);
        return candidates.length ? Math.max(...candidates) : null;
      };

      setPhase('legends');
      const legendsRes = await api.getMetaLegends(effectiveId);
      // Every legend on the page is scanned, including the ones at 0%
      // metashare: a fringe deck still protects the cards it plays.
      const allLegends = legendsRes.legends;

      // Highest play rate seen for each card across all meta decks,
      // keyed by card id, variant-stripped id, and normalized name.
      const usage = new Map();
      const record = (key, playRate, legendName) => {
        if (!key) return;
        const prev = usage.get(key);
        if (!prev || playRate > prev.playRate) {
          usage.set(key, { playRate, legend: legendName });
        }
      };

      setPhase('maps');
      setProgress({ current: 0, total: allLegends.length, name: '' });
      for (let i = 0; i < allLegends.length; i++) {
        const legend = allLegends[i];
        setProgress({ current: i, total: allLegends.length, name: legend.name });
        const mm = await api.getMetaMap(effectiveId, legend.slug);
        for (const c of mm.cards) {
          if (c.playRate == null) continue;
          if (c.cardId) {
            record(c.cardId.toUpperCase(), c.playRate, legend.name);
            record(stripVariant(c.cardId.toUpperCase()), c.playRate, legend.name);
          }
          record(`n:${normName(c.name)}`, c.playRate, legend.name);
        }
        setProgress({ current: i + 1, total: allLegends.length, name: legend.name });
      }

      const lookupUsage = (card) => {
        const candidates = [
          usage.get(card.id.toUpperCase()),
          usage.get(stripVariant(card.id.toUpperCase())),
          usage.get(`n:${normName(card.name)}`),
        ].filter(Boolean);
        if (candidates.length === 0) return null;
        return candidates.reduce((a, b) => (b.playRate > a.playRate ? b : a));
      };

      const rows = [];
      let unknownPrice = 0;

      // Blank or nonsense input falls back to the defaults rather than
      // analyzing against NaN.
      const maxPrice = Number(priceLimit) > 0 ? Number(priceLimit) : DEFAULT_PRICE_LIMIT;
      const maxPlayRate =
        Number(playRateLimit) >= 0 && playRateLimit !== ''
          ? Number(playRateLimit)
          : DEFAULT_PLAY_RATE_LIMIT;
      const maxPopularity =
        Number(popularityLimit) >= 0 && popularityLimit !== ''
          ? Number(popularityLimit)
          : DEFAULT_POPULARITY_LIMIT;

      for (const card of cards) {
        const normalOwned = collection[card.id]?.normal || 0;
        if (normalOwned <= 0) continue;
        if (card.rarity !== 'Common' && card.rarity !== 'Uncommon') continue;
        if (card.type === 'Rune' || isToken(card)) continue;

        const price = card.price;
        if (price == null || price <= 0) {
          if (!hasTag(tags, card.id, KEEP_TAG)) unknownPrice += 1;
          continue;
        }
        const use = lookupUsage(card);
        // A card is protected when a meta deck plays it above the play-rate
        // limit, or, when the optional test is on, when the whole field plays it
        // above the popularity limit. Either measure keeps it out of bulk.
        const popularity = usePopularity ? lookupPopularity(card) : null;
        const played = Boolean(use && use.playRate > maxPlayRate);
        const popular = popularity != null && popularity > maxPopularity;
        const protectedByMeta = played || popular;

        // The lock is a live tag, so a row carries the list it belongs to with
        // the lock *ignored* and the page routes it at render time. That way the
        // button moves a card between the lists at the click, and a re-run
        // produces exactly what is already on screen.
        let home;
        if (price >= maxPrice) {
          // The price is the only test this card fails. A card that is both too
          // expensive and protected belongs to no list, because the meta
          // already answers it.
          if (protectedByMeta) continue;
          home = 'pricyCards';
        } else {
          home = protectedByMeta ? 'protectedCards' : 'bulk';
        }

        rows.push({
          card,
          copies: normalOwned,
          price,
          value: normalOwned * price,
          playRate: use?.playRate ?? 0,
          legend: use?.legend ?? null,
          popularity,
          home,
        });
      }

      setResult({
        metagameId: effectiveId,
        fetchedAt: legendsRes.fetchedAt,
        allLegends,
        rows,
        unknownPrice,
        // Captured so the prose describes the run that produced this table,
        // not whatever the inputs say now.
        priceLimit: maxPrice,
        playRateLimit: maxPlayRate,
        usePopularity,
        popularityLimit: maxPopularity,
        staplesSource,
      });
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  // Every row the run produced, each carrying the lock and the owned count as
  // they stand now. The toolbar drives all four lists, so its options have to
  // cover all four or a chip a lower list needs would be missing. Copies and
  // value read the live collection, not the run snapshot, so the remove buttons
  // take effect on screen at the click: a card emptied to 0 normal copies falls
  // under the min-copies floor and drops out of its list.
  const allRows = useMemo(() => {
    if (!result) return [];
    return result.rows.map((e) => {
      const copies = collection[e.card.id]?.normal || 0;
      return {
        ...e,
        copies,
        value: copies * e.price,
        keep: hasTag(tags, e.card.id, KEEP_TAG),
      };
    });
  }, [result, tags, collection]);

  // Only the sets the run actually produced, so a box never empties every
  // table at once.
  const setOptions = useMemo(() => {
    const counts = new Map();
    for (const e of allRows) {
      counts.set(e.card.setCode, (counts.get(e.card.setCode) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => setRank(a.code) - setRank(b.code) || a.code.localeCompare(b.code));
  }, [allRows]);

  const toggleSet = (code) => {
    setSetFilter((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Only the domains the run produced, for the same reason the sets are limited
  // to it. A card with no colors counts as Colorless.
  const domainOptions = useMemo(() => {
    const counts = new Map();
    for (const e of allRows) {
      const list = e.card.colors?.length ? e.card.colors : ['Colorless'];
      for (const c of list) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return COLORS.filter((c) => counts.has(c)).map((c) => ({ domain: c, count: counts.get(c) }));
  }, [allRows]);

  const toggleDomain = (domain) => {
    setDomainFilter((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  // A locked row belongs to the locked list whatever the run said, so the lock
  // button moves the card between the lists immediately.
  const partition = (rows) => {
    const out = { bulk: [], protectedCards: [], keptCards: [], pricyCards: [] };
    for (const e of rows) out[e.keep ? 'keptCards' : e.home].push(e);
    return out;
  };

  // One filter and one sort for every list on the page, so a search or a domain
  // narrows all four the same way.
  const applyView = useMemo(() => {
    const text = query.trim();
    const floor = Number(minCopies) > 0 ? Number(minCopies) : 1;
    return (rows) =>
      rows
        .filter((e) => {
          if (!cardMatchesText(e.card, text)) return false;
          if (setFilter.length > 0 && !setFilter.includes(e.card.setCode)) return false;
          if (domainFilter.length > 0) {
            const list = e.card.colors?.length ? e.card.colors : ['Colorless'];
            if (!domainFilter.some((d) => list.includes(d))) return false;
          }
          if (rarityFilter !== 'any' && e.card.rarity !== rarityFilter) return false;
          if (playFilter === 'played' && e.playRate <= 0) return false;
          if (playFilter === 'unplayed' && e.playRate > 0) return false;
          if (e.copies < floor) return false;
          return true;
        })
        .sort(SORTS[sort]);
  }, [query, setFilter, domainFilter, rarityFilter, playFilter, minCopies, sort]);

  // Both partitions come from the same live rows: `full` is what the run holds
  // now, and `visible*` is that narrowed by the toolbar. The panels compare the
  // two to say "12 of 40".
  const full = useMemo(() => partition(allRows), [allRows]);

  const {
    bulk: visible,
    protectedCards: visibleProtected,
    keptCards: visibleKept,
    pricyCards: visiblePricy,
  } = useMemo(() => partition(applyView(allRows)), [allRows, applyView]);

  // The stat boxes describe the whole run. The filters narrow only the table
  // below them, which reports its own totals.
  const summary = useMemo(
    () => ({
      unique: full.bulk.length,
      copies: full.bulk.reduce((s, e) => s + e.copies, 0),
      value: full.bulk.reduce((s, e) => s + e.value, 0),
    }),
    [full]
  );

  const shownTotals = useMemo(
    () => ({
      copies: visible.reduce((s, e) => s + e.copies, 0),
      value: visible.reduce((s, e) => s + e.value, 0),
    }),
    [visible]
  );

  const exportCsv = () => {
    const withPop = Boolean(result.usePopularity);
    const head =
      'CardId,Name,Set,Rarity,NormalCopies,Price,TotalValue,MaxMetaPlayRate' +
      (withPop ? ',FieldPopularity' : '');
    const lines = [head];
    for (const e of visible) {
      const row =
        `${e.card.id},${csvCell(e.card.name)},${e.card.setCode},${e.card.rarity},${
          e.copies
        },${e.price.toFixed(2)},${e.value.toFixed(2)},${e.playRate}` +
        (withPop ? `,${e.popularity ?? ''}` : '');
      lines.push(row);
    }
    downloadText(`true-bulk-metagame-${result.metagameId}.csv`, lines.join('\n'));
  };

  const running = phase === 'staples' || phase === 'legends' || phase === 'maps';

  // The bulk rows carry only normal copies, so the remove buttons touch the
  // normal count and leave any foils alone. They read the live collection, not
  // the run snapshot, because a click may have already trimmed the card.
  const removeOne = (card) => {
    const cur = collection[card.id]?.normal || 0;
    if (cur <= 0) return;
    setQty(card.id, 'normal', cur - 1);
  };

  const removeAll = (card) => {
    if ((collection[card.id]?.normal || 0) <= 0) return;
    setQty(card.id, 'normal', 0);
  };

  // Wipes every bulk card the toolbar currently shows. One merge of signed
  // deltas, clamped at 0, so a stale snapshot count can never drive it below
  // what is owned. Guarded, because it clears the whole filtered list at once.
  const removeAllVisible = () => {
    if (visible.length === 0) return;
    const copies = visible.reduce((s, e) => s + (collection[e.card.id]?.normal || 0), 0);
    if (copies <= 0) return;
    if (
      !window.confirm(
        `Remove ${copies} normal copy(ies) of ${visible.length} bulk card(s) from your collection? This cannot be undone.`
      )
    ) {
      return;
    }
    const deltas = {};
    for (const e of visible) {
      const owned = collection[e.card.id]?.normal || 0;
      if (owned > 0) deltas[e.card.id] = { normal: -owned };
    }
    mergeCollection(deltas);
  };

  // Every list wires its table to the same three handlers. Only the bulk list
  // adds the remove buttons, so it gets its own props.
  const tableProps = {
    showPopularity: Boolean(result?.usePopularity),
    onOpen: setDetailId,
    onHover: showHover,
    onToggleKeep: toggleCardTag,
  };
  const bulkTableProps = { ...tableProps, onRemoveOne: removeOne, onRemoveAll: removeAll };

  return (
    <div>
      <h1 className="page-title">True Bulk Analyzer</h1>

      <div className="bulk-controls">
        <label className="field">
          <span>Metagame</span>
          <select value={metagameId} onChange={(e) => setMetagameId(e.target.value)}>
            {METAGAME_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Custom metagame id (optional)</span>
          <input
            type="number"
            min="1"
            placeholder="overrides preset"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            style={{ width: 160 }}
          />
        </label>
        <label className="field">
          <span>Price under ($)</span>
          <input
            type="number"
            min="0"
            step="0.05"
            value={priceLimit}
            onChange={(e) => setPriceLimit(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <label className="field">
          <span>Max play rate (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={playRateLimit}
            onChange={(e) => setPlayRateLimit(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        {/* The optional field-popularity test. The checkbox turns it on and the
            number is the limit; a card at or above it is held out of bulk. */}
        <label className="field">
          <span>Max field popularity (%)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }}>
            <input
              type="checkbox"
              checked={usePopularity}
              onChange={(e) => setUsePopularity(e.target.checked)}
              title="Also hold out cards the whole field plays above the limit"
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={popularityLimit}
              onChange={(e) => setPopularityLimit(e.target.value)}
              disabled={!usePopularity}
              style={{ width: 90 }}
            />
          </span>
        </label>
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Analyzing…' : 'Run analysis'}
        </button>
      </div>

      {phase === 'staples' && (
        <div className="bulk-progress">Reading the most played cards of the format…</div>
      )}
      {phase === 'legends' && (
        <div className="bulk-progress">Fetching legends for metagame {effectiveId}…</div>
      )}
      {phase === 'maps' && (
        <div className="bulk-progress">
          Fetching meta maps ({progress.current} / {progress.total})
          {progress.name ? ` — ${progress.name}` : ''}
          <div className="bar">
            <div
              style={{
                width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      {phase === 'error' && <div className="error-banner">Analysis failed: {error}</div>}

      {result && (
        <>
          <div className="summary-cards">
            <div className="stat-box">
              <div className="v">{summary.unique}</div>
              <div className="k">Unique bulk cards</div>
            </div>
            <div className="stat-box">
              <div className="v">{summary.copies}</div>
              <div className="k">Total bulk copies</div>
            </div>
            <div className="stat-box">
              <div className="v">{money(summary.value)}</div>
              <div className="k">Total bulk value</div>
            </div>
            <div className="stat-box">
              <div className="v">{result.allLegends.length}</div>
              <div className="k">Meta decks checked</div>
            </div>
          </div>

          <div className="section-head">
            <h3>Meta decks scanned</h3>
            <span className="muted">
              data fetched {new Date(result.fetchedAt).toLocaleString()} —{' '}
              <Link to="/config">refresh fresh meta data</Link> on the Config page
            </span>
          </div>
          <div className="hstack" style={{ marginBottom: 14 }}>
            {result.allLegends.map((l) => (
              <span
                key={l.slug}
                className={`pill ${l.sharePct > 0 ? 'green' : ''}`}
                title={`${l.decks ?? '?'} decks`}
              >
                {l.name} · {l.sharePct}%
              </span>
            ))}
          </div>

          {result.usePopularity && (
            <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
              Field popularity from the riftdecks.com staples list (
              {result.staplesSource.cardCount} cards), fetched{' '}
              {new Date(result.staplesSource.fetchedAt).toLocaleString()}. A common/uncommon at{' '}
              above {result.popularityLimit}% popularity is held out of the bulk list.
              {result.popularityLimit < result.staplesSource.minPopularity
                ? ` The list stops at ${result.staplesSource.minPopularity}%, thus a limit below that cannot hold out more cards.`
                : ''}
            </p>
          )}

          {/* One bar for every list on the page, so a search or a domain
              narrows all of them together. It sits above the panels, and not
              inside one, because closing a list must not hide it. */}
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search name, ID, or text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 220 }}
            />
            {/* The counts are for the whole run, not for the other filters, so
                a box never changes its number as the rest of the bar moves. */}
            <span className="set-checks">
              {setOptions.map(({ code, count }) => (
                <label key={code} className="inline" title={setLabel({ setCode: code })}>
                  <input
                    type="checkbox"
                    checked={setFilter.includes(code)}
                    onChange={() => toggleSet(code)}
                  />
                  <span>
                    {code} <span className="muted">({count})</span>
                  </span>
                </label>
              ))}
            </span>
            <DomainChips
              options={domainOptions}
              selected={domainFilter}
              onToggle={toggleDomain}
            />
            <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
              <option value="any">Common + Uncommon</option>
              <option value="Common">Common</option>
              <option value="Uncommon">Uncommon</option>
            </select>
            <select value={playFilter} onChange={(e) => setPlayFilter(e.target.value)}>
              <option value="any">Any play rate</option>
              <option value="unplayed">Unplayed in meta</option>
              <option value="played">Played at all</option>
            </select>
            <label className="inline">
              Min copies
              <input
                type="number"
                min="1"
                step="1"
                style={{ width: 64 }}
                value={minCopies}
                onChange={(e) => setMinCopies(e.target.value)}
              />
            </label>
            <span className="spacer" />
            {/* The totals are the bulk list only. The lists under it are the
                cards the rules rejected, and adding them up would be a number
                you can never sell. */}
            <span className="count-note">
              bulk: {shownTotals.copies} copies · {money(shownTotals.value)}
              {visibleKept.length > 0 ? ` · ${visibleKept.length} locked out` : ''}
            </span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="value">Sort: Value</option>
              <option value="copies">Sort: Copies</option>
              <option value="price">Sort: Price (high)</option>
              <option value="priceAsc">Sort: Price (low)</option>
              <option value="playRate">Sort: Play rate</option>
              <option value="name">Sort: Name</option>
              <option value="set">Sort: Set</option>
            </select>
            <button onClick={exportCsv} disabled={visible.length === 0}>
              Export CSV
            </button>
            {/* Clears every bulk card the filters currently show. It reads the
                same `visible` list the True bulk table renders, so what it
                removes is exactly what is on screen. */}
            <button
              className="danger"
              onClick={removeAllVisible}
              disabled={visible.length === 0}
              title="Remove all normal copies of every bulk card shown below from your collection"
            >
              Remove all shown bulk
            </button>
          </div>

          {/* The bulk list is open by default, because this is the answer the
              page exists to give. The three under it start closed. */}
          <ResultPanel
            title="True bulk"
            open
            rows={visible}
            total={full.bulk.length}
            tableProps={bulkTableProps}
            noRows="No true bulk found — none of your owned commons/uncommons matched the rule."
            empty={`No bulk card matches these filters. ${full.bulk.length} cards are in the run.`}
          />

          <ResultPanel
            title="Cheap but protected by meta play"
            rows={visibleProtected}
            total={full.protectedCards.length}
            tableProps={tableProps}
            empty="No card here matches these filters."
          >
            <p className="muted">
              These commons/uncommons are worth under {money(result.priceLimit)} but exceed{' '}
              {result.playRateLimit}% play rate in at least one meta deck
              {result.usePopularity
                ? `, or exceed ${result.popularityLimit}% field popularity,`
                : ''}{' '}
              so they are not true bulk.
            </p>
          </ResultPanel>

          <ResultPanel
            title="Above the price limit, but not played"
            rows={visiblePricy}
            total={full.pricyCards.length}
            tableProps={tableProps}
            empty="No card here matches these filters."
          >
            <p className="muted">
              The meta plays these at {result.playRateLimit}% or less
              {result.usePopularity
                ? ` and at ${result.popularityLimit}% field popularity or less`
                : ''},
              and the price is the only bulk test they fail. They are worth{' '}
              {money(result.priceLimit)} or more, so they are the cards to sell one by one rather
              than by the box.
            </p>
          </ResultPanel>

          <ResultPanel
            title={`Locked by ${KEEP_TAG}`}
            rows={visibleKept}
            total={full.keptCards.length}
            tableProps={tableProps}
            noRows="No card in this run carries the lock."
            empty="No locked card matches these filters."
          >
            <p className="muted">
              The {KEEP_TAG} tag holds these out of the lists above whatever the numbers say. Lock a
              card anywhere on this page and it moves here at the click; unlock it here and it
              returns to the list its price and play rate put it in.
            </p>
          </ResultPanel>

          {result.unknownPrice > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              {result.unknownPrice} owned common/uncommon card(s) had no usable price data and were
              left out of the bulk list to be safe.
            </p>
          )}
          {full.keptCards.length > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              {full.keptCards.length} card(s) in this run carry the {KEEP_TAG} tag and are held in
              the locked list.
            </p>
          )}
        </>
      )}

      {hover && (
        <img
          className="card-hover-preview"
          src={hover.image}
          alt={hover.name}
          style={{ left: hover.x, top: hover.y, width: PREVIEW_W }}
        />
      )}

      {detailId && (
        <CardDetailModal card={cardsById.get(detailId)} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
