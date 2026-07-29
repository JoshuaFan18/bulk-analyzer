// Rules: docs/staples-analyzer.md
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import {
  COLORS,
  METAGAME_PRESETS,
  RARITIES,
  cardMatchesText,
  dedupeByIdentity,
  effectivePrice,
  isBasePrinting,
  money,
  normName,
  ownedAcrossPrintings,
  playsetTarget,
  setLabel,
  setRank,
} from '../lib/cards.js';
import { csvCell, downloadText } from '../lib/download.js';
import { KEEP_TAG, hasTag } from '../lib/tags.js';
import CardDetailModal from '../components/CardDetailModal.jsx';
import DomainChips from '../components/DomainChips.jsx';
import Modal from '../components/Modal.jsx';

const PREVIEW_W = 260;
const PREVIEW_H = 364;

const DEFAULT_STAPLE_LIMIT = 50;

const stripVariant = (id) => String(id).replace(/([0-9])[a-z]$/i, '$1');

// The same sort set as the bulk table, so the two analyzers behave alike. A
// card with no price sorts as 0 here because every row is a card the meta
// plays: the question is which staples you hold, not which are safe to sell.
const SORTS = {
  playRate: (a, b) => b.topPlayRate - a.topPlayRate || b.deckCount - a.deckCount,
  decks: (a, b) => b.deckCount - a.deckCount || b.topPlayRate - a.topPlayRate,
  value: (a, b) => b.value - a.value || b.copies - a.copies,
  copies: (a, b) => b.copies - a.copies || b.value - a.value,
  price: (a, b) => b.price - a.price || a.card.name.localeCompare(b.card.name),
  priceAsc: (a, b) => a.price - b.price || a.card.name.localeCompare(b.card.name),
  name: (a, b) => a.card.name.localeCompare(b.card.name),
  set: (a, b) =>
    setRank(a.card.setCode) - setRank(b.card.setCode) || a.card.id.localeCompare(b.card.id),
};

// The thumbnail is the way into the meta-deck table for that card, and a hover
// gives the floating full-card preview, so a row can be judged in the list.
function CardCell({ card, onOpen, onHover }) {
  return (
    <div className="bulk-card-cell">
      <button
        type="button"
        className="dc-thumb"
        title={`${card.name} — see the meta decks that play it`}
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

// The same lock the collection tile and the bulk table use, so the tag means
// the same thing on every screen. A staple is exactly the card you never want
// to send to the bulk box, thus the lock sits here too.
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

// The bulk table columns, with no Remove column: this page never changes the
// collection. The copies are folded across the printings, because a row is a
// card and not a printing.
function ResultTable({ rows, onOpen, onHover, onToggleKeep }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Card</th>
          <th>Set</th>
          <th>Rarity</th>
          <th className="num">Copies owned</th>
          <th className="num">Price</th>
          <th className="num">Value</th>
          <th className="num">Max meta play rate</th>
          <th>{KEEP_TAG}</th>
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
              {e.topPlayRate}%
              <span className="muted">
                {' '}
                ({e.topLegend}
                {e.deckCount > 1 ? ` +${e.deckCount - 1}` : ''})
              </span>
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

// One collapsible list, the same shape as the bulk panels: a heading that says
// how many rows survived the toolbar out of how many the run made, an
// explanation, and the table.
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

// The second half of the page: the deck-by-deck answer for one card. The
// thumbnail opens it, thus the list stays the place to scan and this is the
// place to analyze.
function MetaDecksModal({ row, owned, limit, onClose, onDetails }) {
  const target = playsetTarget(row.card);
  const short = target - owned.total;
  return (
    <Modal
      className="wide"
      onClose={onClose}
      title={
        <>
          <span className="cd-heading">
            <span className="cd-name">{row.card.name}</span>
            <span className="cd-type">
              {setLabel(row.card)} · {row.card.rarity} · {money(effectivePrice(row.card))}
            </span>
          </span>
          <button className="cd-close" onClick={onClose} title="Close">
            ✕
          </button>
        </>
      }
    >
      <div className="hstack" style={{ alignItems: 'flex-start', gap: 16 }}>
        {row.card.image && (
          <img
            src={row.card.image}
            alt={row.card.name}
            style={{ width: PREVIEW_W, borderRadius: 10 }}
          />
        )}
        <div style={{ flex: 1 }}>
          <p className="muted">
            You own {owned.total} copy(ies) ({owned.normal} normal, {owned.foil} foil) across every
            printing
            {target > 0
              ? short > 0
                ? ` — ${short} short of the playset of ${target}.`
                : ` — the playset of ${target} is complete.`
              : '.'}
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Meta deck</th>
                <th className="num">Deck metashare</th>
                <th className="num">Play rate</th>
                <th className="num">Average copies</th>
                <th className="num">Decks</th>
                <th className="num">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {row.decks.map((d) => (
                <tr key={d.legend}>
                  <td>{d.legend}</td>
                  <td className="num">{d.legendShare}%</td>
                  <td className="num">{d.playRate}%</td>
                  <td className="num">{d.copies ?? '—'}</td>
                  <td className="num">{d.decks ?? '—'}</td>
                  <td className="num">{d.winRate != null ? `${d.winRate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 8 }}>
            Every deck that plays this card in more than {limit}% of its lists.
          </p>
          <button onClick={() => onDetails(row.card.id)}>Full card details</button>
        </div>
      </div>
    </Modal>
  );
}

export default function StaplesAnalyzerPage() {
  const { cards, cardsById, ownedIndex, tags, toggleCardTag } = useApp();
  const [metagameId, setMetagameId] = useState('1');
  const [customId, setCustomId] = useState('');
  const [stapleLimit, setStapleLimit] = useState(String(DEFAULT_STAPLE_LIMIT));
  const [phase, setPhase] = useState('idle'); // idle | legends | maps | done | error
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // View state for the lists. These never re-run the analysis.
  const [query, setQuery] = useState('');
  // An empty list means every set, so a list is never empty by default and
  // clearing the last box does not hide everything.
  const [setFilter, setSetFilter] = useState([]);
  const [domainFilter, setDomainFilter] = useState([]);
  const [rarityFilter, setRarityFilter] = useState('any');
  const [sort, setSort] = useState('playRate');

  // The ids, and not the cards, so an open popup shows the new price after a
  // refresh. The meta-deck popup is the thumbnail; the card detail opens from
  // inside it.
  const [decksId, setDecksId] = useState(null);
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
    setDecksId(null);
    try {
      const legendsRes = await api.getMetaLegends(effectiveId);
      // Every legend on the page counts, at any metashare: one deck that plays
      // a card in almost every list makes it a staple of that deck.
      const allLegends = legendsRes.legends;

      // key -> Map(legend name -> the usage row). The keys are the same three
      // the bulk analyzer uses, because the riftdecks ids do not match the
      // DotGG ids. A legend appears one time per key, at its highest play rate,
      // thus a card that resolves on two keys cannot count one deck two times.
      const usage = new Map();
      const record = (key, entry) => {
        if (!key) return;
        const byLegend = usage.get(key) || new Map();
        const prev = byLegend.get(entry.legend);
        if (!prev || entry.playRate > prev.playRate) byLegend.set(entry.legend, entry);
        usage.set(key, byLegend);
      };

      setPhase('maps');
      setProgress({ current: 0, total: allLegends.length, name: '' });
      for (let i = 0; i < allLegends.length; i++) {
        const legend = allLegends[i];
        setProgress({ current: i, total: allLegends.length, name: legend.name });
        const mm = await api.getMetaMap(effectiveId, legend.slug);
        for (const c of mm.cards) {
          if (c.playRate == null) continue;
          const entry = {
            legend: legend.name,
            legendShare: legend.sharePct,
            name: c.name,
            playRate: c.playRate,
            copies: c.copies ?? null,
            decks: c.decks ?? null,
            winRate: c.winRate ?? null,
          };
          if (c.cardId) {
            record(c.cardId.toUpperCase(), entry);
            record(stripVariant(c.cardId.toUpperCase()), entry);
          }
          record(`n:${normName(c.name)}`, entry);
        }
        setProgress({ current: i + 1, total: allLegends.length, name: legend.name });
      }

      // Blank or nonsense input falls back to the default rather than
      // analyzing against NaN.
      const minPlayRate =
        Number(stapleLimit) >= 0 && stapleLimit !== ''
          ? Number(stapleLimit)
          : DEFAULT_STAPLE_LIMIT;

      // One row for each real card, and not for each printing: the list must
      // not hold the same card three times because it has two alt arts.
      const pool = dedupeByIdentity(cards.filter(isBasePrinting));

      const rows = [];
      const matchedNames = new Set();
      for (const card of pool) {
        const byLegend = new Map();
        for (const key of [
          card.id.toUpperCase(),
          stripVariant(card.id.toUpperCase()),
          `n:${normName(card.name)}`,
        ]) {
          for (const [legend, entry] of usage.get(key) || []) {
            const prev = byLegend.get(legend);
            if (!prev || entry.playRate > prev.playRate) byLegend.set(legend, entry);
          }
        }
        if (byLegend.size === 0) continue;
        for (const entry of byLegend.values()) matchedNames.add(normName(entry.name));

        const decks = [...byLegend.values()]
          .filter((e) => e.playRate > minPlayRate)
          .sort((a, b) => b.playRate - a.playRate || a.legend.localeCompare(b.legend));
        if (decks.length === 0) continue;

        rows.push({
          card,
          decks,
          topPlayRate: decks[0].playRate,
          topLegend: decks[0].legend,
          deckCount: decks.length,
          price: effectivePrice(card) ?? 0,
        });
      }

      // A meta card above the limit that the card database never matched can
      // never reach a list, thus the run says so rather than losing it in
      // silence.
      const unmatched = new Set();
      for (const byLegend of usage.values()) {
        for (const entry of byLegend.values()) {
          if (entry.playRate > minPlayRate && !matchedNames.has(normName(entry.name))) {
            unmatched.add(entry.name);
          }
        }
      }

      setResult({
        metagameId: effectiveId,
        fetchedAt: legendsRes.fetchedAt,
        allLegends,
        rows,
        unmatched: [...unmatched].sort(),
        // Captured so the text describes the run that made these lists, and
        // not whatever the input says now.
        stapleLimit: minPlayRate,
      });
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  };

  // Every row the run made, each carrying the copies and the lock as they stand
  // now, thus a stepper on another page moves a card between the two lists at
  // the next render.
  const allRows = useMemo(() => {
    if (!result) return [];
    return result.rows.map((e) => {
      const owned = ownedAcrossPrintings(e.card, ownedIndex);
      return {
        ...e,
        owned,
        copies: owned.total,
        value: owned.total * e.price,
        keep: hasTag(tags, e.card.id, KEEP_TAG),
      };
    });
  }, [result, ownedIndex, tags]);

  // Only the sets and the domains the run made, so a box never empties both
  // tables at one time.
  const setOptions = useMemo(() => {
    const counts = new Map();
    for (const e of allRows) counts.set(e.card.setCode, (counts.get(e.card.setCode) || 0) + 1);
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => setRank(a.code) - setRank(b.code) || a.code.localeCompare(b.code));
  }, [allRows]);

  const toggleSet = (code) => {
    setSetFilter((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

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

  const rarityOptions = useMemo(
    () => RARITIES.filter((r) => allRows.some((e) => e.card.rarity === r)),
    [allRows]
  );

  // The one question the page exists to answer: which staples are already in
  // the binder, and which are not.
  const partition = (rows) => {
    const out = { owned: [], missing: [] };
    for (const e of rows) out[e.copies > 0 ? 'owned' : 'missing'].push(e);
    return out;
  };

  // One filter and one sort for the two lists, so a search or a domain narrows
  // both the same way.
  const applyView = useMemo(() => {
    const text = query.trim();
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
          return true;
        })
        .sort(SORTS[sort]);
  }, [query, setFilter, domainFilter, rarityFilter, sort]);

  const full = useMemo(() => partition(allRows), [allRows]);
  const { owned: visibleOwned, missing: visibleMissing } = useMemo(
    () => partition(applyView(allRows)),
    [allRows, applyView]
  );

  const summary = useMemo(
    () => ({
      owned: full.owned.length,
      missing: full.missing.length,
      value: full.owned.reduce((s, e) => s + e.value, 0),
    }),
    [full]
  );

  const exportCsv = () => {
    const lines = [
      'CardId,Name,Set,Rarity,CopiesOwned,Price,TotalValue,TopPlayRate,TopLegend,DecksAboveLimit',
    ];
    for (const e of [...visibleOwned, ...visibleMissing]) {
      lines.push(
        `${e.card.id},${csvCell(e.card.name)},${e.card.setCode},${e.card.rarity},${e.copies},${e.price.toFixed(
          2
        )},${e.value.toFixed(2)},${e.topPlayRate},${csvCell(e.topLegend)},${e.deckCount}`
      );
    }
    downloadText(`staples-metagame-${result.metagameId}.csv`, lines.join('\n'));
  };

  const running = phase === 'legends' || phase === 'maps';
  const decksRow = decksId ? allRows.find((e) => e.card.id === decksId) : null;
  const tableProps = { onOpen: setDecksId, onHover: showHover, onToggleKeep: toggleCardTag };

  return (
    <div>
      <h1 className="page-title">Staples Analyzer</h1>

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
          <span>Play rate above (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={stapleLimit}
            onChange={(e) => setStapleLimit(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Analyzing…' : 'Find staples'}
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
              <div className="v">{summary.owned}</div>
              <div className="k">Staples you own</div>
            </div>
            <div className="stat-box">
              <div className="v">{summary.missing}</div>
              <div className="k">Staples you are missing</div>
            </div>
            <div className="stat-box">
              <div className="v">{money(summary.value)}</div>
              <div className="k">Value of the staples you own</div>
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

          {/* One bar for the two lists. It sits above the panels, and not
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
            <DomainChips options={domainOptions} selected={domainFilter} onToggle={toggleDomain} />
            <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
              <option value="any">Any rarity</option>
              {rarityOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span className="spacer" />
            <span className="count-note">
              owned: {visibleOwned.length} · missing: {visibleMissing.length}
            </span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="playRate">Sort: Play rate</option>
              <option value="decks">Sort: Decks above limit</option>
              <option value="value">Sort: Value</option>
              <option value="copies">Sort: Copies</option>
              <option value="price">Sort: Price (high)</option>
              <option value="priceAsc">Sort: Price (low)</option>
              <option value="name">Sort: Name</option>
              <option value="set">Sort: Set</option>
            </select>
            <button
              onClick={exportCsv}
              disabled={visibleOwned.length + visibleMissing.length === 0}
            >
              Export CSV
            </button>
          </div>

          {/* The owned list is open by default, because "what staples do I
              hold" is the question the page exists to answer. */}
          <ResultPanel
            title="Staples you own"
            open
            rows={visibleOwned}
            total={full.owned.length}
            tableProps={tableProps}
            noRows="You own no card that the meta plays above the limit."
            empty={`No owned staple matches these filters. ${full.owned.length} are in the run.`}
          >
            <p className="muted">
              The meta plays each of these in more than {result.stapleLimit}% of the lists of a
              minimum of one deck, and you have a copy. Click the thumbnail to see every deck that
              plays it.
            </p>
          </ResultPanel>

          <ResultPanel
            title="Staples you are missing"
            rows={visibleMissing}
            total={full.missing.length}
            tableProps={tableProps}
            noRows="You own every staple in this run."
            empty="No missing staple matches these filters."
          >
            <p className="muted">
              Above the limit in a minimum of one deck, and you have no copy in any printing.
            </p>
          </ResultPanel>

          {result.unmatched.length > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              {result.unmatched.length} card(s) above the limit on riftdecks.com have no match in
              the card database and are in neither list: {result.unmatched.join(', ')}.
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

      {decksRow && !detailId && (
        <MetaDecksModal
          row={decksRow}
          owned={decksRow.owned}
          limit={result.stapleLimit}
          onClose={() => setDecksId(null)}
          onDetails={setDetailId}
        />
      )}

      {detailId && (
        <CardDetailModal card={cardsById.get(detailId)} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
