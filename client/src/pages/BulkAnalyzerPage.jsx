import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import {
  COLORS,
  COLOR_HEX,
  SET_RELEASE_ORDER,
  cardMatchesText,
  isToken,
  money,
  normName,
  setLabel,
} from '../lib/cards.js';
import { DOMAIN_ICON } from '../lib/icons.js';
import { csvCell, downloadText } from '../lib/download.js';
import { KEEP_TAG, hasTag } from '../lib/tags.js';
import CardDetailModal from '../components/CardDetailModal.jsx';
import DomainIcon from '../components/DomainIcon.jsx';

const PREVIEW_W = 260;
const PREVIEW_H = 364;

const DEFAULT_PRICE_LIMIT = 0.25;
const DEFAULT_PLAY_RATE_LIMIT = 10;

const PRESETS = [
  { id: '1', label: 'Origins (1)' },
  { id: '2', label: 'Spiritforged (2)' },
  { id: '3', label: 'Unleashed (3)' },
  { id: '4', label: 'Vendetta (4)' },
];

const stripVariant = (id) => String(id).replace(/([0-9])[a-z]$/i, '$1');

// An unknown (future) set code sorts last rather than first, which a bare
// indexOf would do.
const setRank = (code) => {
  const i = SET_RELEASE_ORDER.indexOf(code);
  return i < 0 ? SET_RELEASE_ORDER.length : i;
};

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
// A locked row keeps its place and is struck through, because the run behind it
// cannot be rebuilt from the new tag.
function ResultTable({ rows, onOpen, onHover, onToggleKeep }) {
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
          <th>{KEEP_TAG}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.card.id} className={e.keep ? 'row-kept' : ''}>
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
            <td>
              <KeepButton card={e.card} kept={e.keep} onToggle={onToggleKeep} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BulkAnalyzerPage() {
  const { cards, cardsById, collection, tags, toggleCardTag } = useApp();
  const [metagameId, setMetagameId] = useState('1');
  const [customId, setCustomId] = useState('');
  const [priceLimit, setPriceLimit] = useState(String(DEFAULT_PRICE_LIMIT));
  const [playRateLimit, setPlayRateLimit] = useState(String(DEFAULT_PLAY_RATE_LIMIT));
  const [refresh, setRefresh] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | legends | maps | done | error
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
    setPhase('legends');
    setError(null);
    setResult(null);
    try {
      const legendsRes = await api.getMetaLegends(effectiveId, refresh);
      const allLegends = legendsRes.legends;
      const metaLegends = allLegends.filter((l) => l.sharePct > 0);

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
      setProgress({ current: 0, total: metaLegends.length, name: '' });
      for (let i = 0; i < metaLegends.length; i++) {
        const legend = metaLegends[i];
        setProgress({ current: i, total: metaLegends.length, name: legend.name });
        const mm = await api.getMetaMap(effectiveId, legend.slug, refresh);
        for (const c of mm.cards) {
          if (c.playRate == null) continue;
          if (c.cardId) {
            record(c.cardId.toUpperCase(), c.playRate, legend.name);
            record(stripVariant(c.cardId.toUpperCase()), c.playRate, legend.name);
          }
          record(`n:${normName(c.name)}`, c.playRate, legend.name);
        }
        setProgress({ current: i + 1, total: metaLegends.length, name: legend.name });
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

      const bulk = [];
      const protectedCards = [];
      const keptCards = [];
      const pricyCards = [];
      let unknownPrice = 0;
      let keptCount = 0;

      // Blank or nonsense input falls back to the defaults rather than
      // analyzing against NaN.
      const maxPrice = Number(priceLimit) > 0 ? Number(priceLimit) : DEFAULT_PRICE_LIMIT;
      const maxPlayRate =
        Number(playRateLimit) >= 0 && playRateLimit !== ''
          ? Number(playRateLimit)
          : DEFAULT_PLAY_RATE_LIMIT;

      for (const card of cards) {
        const normalOwned = collection[card.id]?.normal || 0;
        if (normalOwned <= 0) continue;
        if (card.rarity !== 'Common' && card.rarity !== 'Uncommon') continue;
        if (card.type === 'Rune' || isToken(card)) continue;
        // A locked card still goes through the price and play-rate tests, so the
        // third list can show what the lock is actually holding back. It never
        // reaches bulk or the totals.
        const locked = hasTag(tags, card.id, KEEP_TAG);
        if (locked) keptCount += 1;

        const price = card.price;
        if (price == null || price <= 0) {
          if (!locked) unknownPrice += 1;
          continue;
        }
        const use = lookupUsage(card);
        const entry = {
          card,
          copies: normalOwned,
          price,
          value: normalOwned * price,
          playRate: use?.playRate ?? 0,
          legend: use?.legend ?? null,
        };
        const played = use && use.playRate > maxPlayRate;

        // The price is the only test this card fails. A card that is both too
        // expensive and too played belongs to neither list, because the meta
        // already answers it.
        if (price >= maxPrice) {
          if (!played && !locked) pricyCards.push(entry);
          continue;
        }
        if (locked) keptCards.push(entry);
        else if (played) protectedCards.push(entry);
        else bulk.push(entry);
      }

      bulk.sort((a, b) => b.value - a.value);
      protectedCards.sort((a, b) => b.playRate - a.playRate);
      keptCards.sort((a, b) => b.value - a.value);
      pricyCards.sort((a, b) => b.value - a.value);

      setResult({
        metagameId: effectiveId,
        fetchedAt: legendsRes.fetchedAt,
        allLegends,
        metaLegends,
        bulk,
        protectedCards,
        keptCards,
        pricyCards,
        unknownPrice,
        keptCount,
        // Captured so the prose describes the run that produced this table,
        // not whatever the inputs say now.
        priceLimit: maxPrice,
        playRateLimit: maxPlayRate,
      });
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  // Every row the run produced. The toolbar drives all four lists, so its
  // options have to cover all four or a chip a lower list needs would be
  // missing.
  const allRows = useMemo(() => {
    if (!result) return [];
    return [...result.bulk, ...result.protectedCards, ...result.keptCards, ...result.pricyCards];
  }, [result]);

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

  // One filter and one sort for every list on the page, so a search or a domain
  // narrows all four the same way. Tagging Keep after a run cannot rebuild the
  // lists, so the row stays in place and carries the flag instead of moving.
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
        .sort(SORTS[sort])
        .map((e) => ({ ...e, keep: hasTag(tags, e.card.id, KEEP_TAG) }));
  }, [query, setFilter, domainFilter, rarityFilter, playFilter, minCopies, sort, tags]);

  const visible = useMemo(
    () => (result ? applyView(result.bulk) : []),
    [result, applyView]
  );
  const visibleProtected = useMemo(
    () => (result ? applyView(result.protectedCards) : []),
    [result, applyView]
  );
  const visibleKept = useMemo(
    () => (result ? applyView(result.keptCards) : []),
    [result, applyView]
  );
  const visiblePricy = useMemo(
    () => (result ? applyView(result.pricyCards) : []),
    [result, applyView]
  );

  const kepts = useMemo(() => visible.filter((e) => e.keep).length, [visible]);

  // The stat boxes describe the whole run. The filters narrow only the table
  // below them, which reports its own totals.
  const summary = useMemo(() => {
    if (!result) return null;
    return {
      unique: result.bulk.length,
      copies: result.bulk.reduce((s, e) => s + e.copies, 0),
      value: result.bulk.reduce((s, e) => s + e.value, 0),
    };
  }, [result]);

  const shownTotals = useMemo(() => {
    const counted = visible.filter((e) => !e.keep);
    return {
      copies: counted.reduce((s, e) => s + e.copies, 0),
      value: counted.reduce((s, e) => s + e.value, 0),
    };
  }, [visible]);

  const exportCsv = () => {
    const lines = ['CardId,Name,Set,Rarity,NormalCopies,Price,TotalValue,MaxMetaPlayRate'];
    for (const e of visible.filter((r) => !r.keep)) {
      lines.push(
        `${e.card.id},${csvCell(e.card.name)},${e.card.setCode},${e.card.rarity},${
          e.copies
        },${e.price.toFixed(2)},${e.value.toFixed(2)},${e.playRate}`
      );
    }
    downloadText(`true-bulk-metagame-${result.metagameId}.csv`, lines.join('\n'));
  };

  const running = phase === 'legends' || phase === 'maps';

  return (
    <div>
      <h1 className="page-title">True Bulk Analyzer</h1>

      <div className="bulk-controls">
        <label className="field">
          <span>Metagame</span>
          <select value={metagameId} onChange={(e) => setMetagameId(e.target.value)}>
            {PRESETS.map((p) => (
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
        <label className="inline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={refresh}
            onChange={(e) => setRefresh(e.target.checked)}
          />
          Re-fetch fresh data from riftdecks.com (ignore cache)
        </label>
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Analyzing…' : 'Run analysis'}
        </button>
      </div>

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
              <div className="v">{result.metaLegends.length}</div>
              <div className="k">Meta decks checked</div>
            </div>
          </div>

          <div className="section-head">
            <h3>Meta decks (displayed metashare &gt; 0%)</h3>
            <span className="muted">
              data fetched {new Date(result.fetchedAt).toLocaleString()}
            </span>
          </div>
          <div className="hstack" style={{ marginBottom: 14 }}>
            {result.allLegends.map((l) => (
              <span
                key={l.slug}
                className={`pill ${l.sharePct > 0 ? 'green' : ''}`}
                title={`${l.decks ?? '?'} decks`}
              >
                {l.name} · {l.sharePct}%{l.sharePct <= 0 ? ' (excluded)' : ''}
              </span>
            ))}
          </div>

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
            {domainOptions.length > 0 && (
              <div className="color-chips">
                {domainOptions.map(({ domain, count }) => (
                  <button
                    key={domain}
                    className={`color-chip ${domainFilter.includes(domain) ? 'on' : ''}`}
                    // Colorless has no art of its own and must not borrow the
                    // rainbow rune, which reads as "any domain". It is a bare
                    // coloured circle, and the title carries the name.
                    style={DOMAIN_ICON[domain] ? undefined : { background: COLOR_HEX[domain] }}
                    title={`${domain} (${count})`}
                    onClick={() => toggleDomain(domain)}
                  >
                    {DOMAIN_ICON[domain] ? <DomainIcon domain={domain} variant="plain" /> : null}
                  </button>
                ))}
              </div>
            )}
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
              {kepts > 0 ? ` · ${kepts} kept out` : ''}
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
          </div>

          {/* Open by default, because this is the answer the page exists to
              give. It closes like the three lists under it. */}
          <details className="panel" open>
            <summary>
              True bulk ({visible.length}
              {visible.length !== result.bulk.length ? ` of ${result.bulk.length}` : ''})
            </summary>

          {result.bulk.length === 0 ? (
            <p className="muted">
              No true bulk found — none of your owned commons/uncommons matched the rule.
            </p>
          ) : visible.length === 0 ? (
            <p className="muted">
              No bulk card matches these filters. {result.bulk.length} cards are in the run.
            </p>
          ) : (
            <ResultTable
              rows={visible}
              onOpen={setDetailId}
              onHover={showHover}
              onToggleKeep={toggleCardTag}
            />
          )}
          </details>

          <details className="panel">
            <summary>
              Cheap but protected by meta play ({visibleProtected.length}
              {visibleProtected.length !== result.protectedCards.length
                ? ` of ${result.protectedCards.length}`
                : ''}
              )
            </summary>
            <p className="muted">
              These commons/uncommons are worth under {money(result.priceLimit)} but exceed{' '}
              {result.playRateLimit}% play rate in at least one meta deck, so they are not true
              bulk.
            </p>
            {visibleProtected.length === 0 ? (
              <p className="muted">No card here matches these filters.</p>
            ) : (
              <ResultTable
                rows={visibleProtected}
                onOpen={setDetailId}
                onHover={showHover}
                onToggleKeep={toggleCardTag}
              />
            )}
          </details>

          <details className="panel">
            <summary>
              Above the price limit, but not played ({visiblePricy.length}
              {visiblePricy.length !== result.pricyCards.length
                ? ` of ${result.pricyCards.length}`
                : ''}
              )
            </summary>
            <p className="muted">
              The meta plays these at {result.playRateLimit}% or less, and the price is the only
              bulk test they fail. They are worth {money(result.priceLimit)} or more, so they are
              the cards to sell one by one rather than by the box.
            </p>
            {visiblePricy.length === 0 ? (
              <p className="muted">No card here matches these filters.</p>
            ) : (
              <ResultTable
                rows={visiblePricy}
                onOpen={setDetailId}
                onHover={showHover}
                onToggleKeep={toggleCardTag}
              />
            )}
          </details>

          <details className="panel">
            <summary>
              Locked by {KEEP_TAG} ({visibleKept.length}
              {visibleKept.length !== result.keptCards.length
                ? ` of ${result.keptCards.length}`
                : ''}
              )
            </summary>
            <p className="muted">
              These pass every bulk test, and only the {KEEP_TAG} tag keeps them out of the list
              above. Unlock one here and it joins the bulk list at the next run.
            </p>
            {visibleKept.length === 0 ? (
              <p className="muted">
                {result.keptCards.length === 0
                  ? 'No locked card would be bulk under these limits.'
                  : 'No locked card matches these filters.'}
              </p>
            ) : (
              <ResultTable
                rows={visibleKept}
                onOpen={setDetailId}
                onHover={showHover}
                onToggleKeep={toggleCardTag}
              />
            )}
          </details>

          {result.unknownPrice > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              {result.unknownPrice} owned common/uncommon card(s) had no usable price data and were
              left out of the bulk list to be safe.
            </p>
          )}
          {result.keptCount > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              {result.keptCount} owned common/uncommon card(s) carry the {KEEP_TAG} tag, and{' '}
              {result.keptCards.length} of them would be bulk under these limits.
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
