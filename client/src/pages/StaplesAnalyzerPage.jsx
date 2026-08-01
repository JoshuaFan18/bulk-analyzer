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
import CardArt from '../components/CardArt.jsx';
import CardDetailModal from '../components/CardDetailModal.jsx';
import DomainChips from '../components/DomainChips.jsx';
import Modal from '../components/Modal.jsx';

const PREVIEW_W = 260;
const PREVIEW_H = 364;

// The three questions the page can ask. "Deck based" reads the per-legend meta
// maps, thus a staple is a card one deck almost always plays. "Field" reads the
// whole-format staples list, thus a staple is a card the format plays. The
// second measure is a popularity against the most played card, and not a share
// of the lists, thus each side keeps its own, very different, limit.
// "Overlap" reads the two sources and joins the two tests with AND or OR.
const MODES = {
  deck: { label: 'Deck based', deckSide: true, fieldSide: false },
  field: { label: 'Field', deckSide: false, fieldSide: true },
  overlap: { label: 'Overlap', deckSide: true, fieldSide: true },
};

// The two measures never share a limit, a label or a column, because a play
// rate is a share of the lists and a popularity is a share of the most played
// card.
const DECK_LIMIT_LABEL = 'Play rate above (%)';
const FIELD_LIMIT_LABEL = 'Popularity above (%)';
const DEFAULT_DECK_LIMIT = 50;
const DEFAULT_FIELD_LIMIT = 10;
const DECK_RATE_COLUMN = 'Max meta play rate';
const FIELD_RATE_COLUMN = 'Popularity';

// The field list has one ranking and no legends, thus every field row carries
// this one pseudo-deck. The shape stays the same as a meta-map entry, so the
// pool loop, the lists and the popup do not have to know which mode made them.
const FIELD_LEGEND = 'All Constructed decks';

// The rarity filter joins the two low rarities into one choice. The value is
// not a rarity name, thus it cannot hit a card by accident.
const LOW_RARITIES = ['Common', 'Uncommon'];
const LOW_RARITY = 'common+uncommon';

const stripVariant = (id) => String(id).replace(/([0-9])[a-z]$/i, '$1');

// The same sort set as the bulk table, so the two analyzers behave alike. A
// card with no price sorts as 0 here because every row is a card the meta
// plays: the question is which staples you hold, not which are safe to sell.
// A row of an OR overlap can miss one of the two rates, thus a missing rate
// sorts below 0 and goes to the end rather than to the top.
const rateOf = (v) => (v == null ? -1 : v);
const SORTS = {
  playRate: (a, b) => rateOf(b.deckRate) - rateOf(a.deckRate) || b.deckCount - a.deckCount,
  popularity: (a, b) =>
    rateOf(b.fieldRate) - rateOf(a.fieldRate) || a.card.name.localeCompare(b.card.name),
  decks: (a, b) => b.deckCount - a.deckCount || rateOf(b.deckRate) - rateOf(a.deckRate),
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
          <CardArt card={card} alt="" />
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
function ResultTable({ rows, mode, onOpen, onHover, onToggleKeep }) {
  // Overlap answers with the two measures at one time, thus it keeps the two
  // columns. Each single-source mode shows its own one.
  const { deckSide, fieldSide } = MODES[mode];
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
          {deckSide && <th className="num">{DECK_RATE_COLUMN}</th>}
          {fieldSide && <th className="num">{FIELD_RATE_COLUMN}</th>}
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
            {deckSide && (
              <td className="num">
                {/* An OR overlap keeps a row that one side alone found, thus a
                    rate can be absent and the dash says which side found it. */}
                {e.deckRate == null ? (
                  '—'
                ) : (
                  <>
                    {e.deckRate}%
                    <span className="muted">
                      {' '}
                      ({e.topLegend}
                      {e.deckCount > 1 ? ` +${e.deckCount - 1}` : ''})
                    </span>
                  </>
                )}
              </td>
            )}
            {fieldSide && <td className="num">{e.fieldRate == null ? '—' : `${e.fieldRate}%`}</td>}
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
function MetaDecksModal({ row, owned, limits, mode, combine, onClose, onDetails }) {
  const target = playsetTarget(row.card);
  const short = target - owned.total;
  // The whole-format list carries no metashare, no deck count and no win rate,
  // thus those columns would be four dashes on every row of a Field run. An
  // Overlap run has meta decks in the same table, thus it keeps them.
  const byDeck = MODES[mode].deckSide;
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
          <CardArt
            card={row.card}
            // The box is given, and not left to the file, or a turned
            // battlefield would make a box of a different height.
            style={{
              width: PREVIEW_W,
              aspectRatio: '5 / 7',
              objectFit: 'cover',
              borderRadius: 10,
              overflow: 'hidden',
            }}
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
                <th>{byDeck ? 'Meta deck' : 'Scope'}</th>
                {byDeck && <th className="num">Deck metashare</th>}
                <th className="num">
                  {mode === 'deck' ? 'Play rate' : mode === 'field' ? 'Popularity' : 'Rate'}
                </th>
                <th className="num">Average copies</th>
                {byDeck && <th className="num">Decks</th>}
                {byDeck && <th className="num">Win rate</th>}
              </tr>
            </thead>
            <tbody>
              {row.decks.map((d) => (
                <tr key={d.legend}>
                  <td>{d.legend}</td>
                  {/* The field row sits in the same table in an Overlap run,
                      and it carries no metashare. */}
                  {byDeck && (
                    <td className="num">{d.legendShare == null ? '—' : `${d.legendShare}%`}</td>
                  )}
                  <td className="num">{d.playRate}%</td>
                  <td className="num">{d.copies ?? '—'}</td>
                  {byDeck && <td className="num">{d.decks ?? '—'}</td>}
                  {byDeck && <td className="num">{d.winRate != null ? `${d.winRate}%` : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 8 }}>
            {mode === 'deck' &&
              `Every deck that plays this card in more than ${limits.deck}% of its lists.`}
            {mode === 'field' &&
              `Popularity against the most played card of the last 30 days, above the ${limits.field}% limit.`}
            {mode === 'overlap' &&
              `Every deck above ${limits.deck}% play rate, and the whole field above ${limits.field}% popularity, joined with ${combine.toUpperCase()}.`}
          </p>
          <button onClick={() => onDetails(row.card.id)}>Full card details</button>
        </div>
      </div>
    </Modal>
  );
}

export default function StaplesAnalyzerPage() {
  const { cards, cardsById, ownedIndex, tags, toggleCardTag } = useApp();
  const [mode, setMode] = useState('deck'); // deck | field | overlap
  const [metagameId, setMetagameId] = useState('1');
  const [customId, setCustomId] = useState('');
  // One input for each measure, because the two limits are never comparable.
  // Overlap drives the two of them, and each other mode drives its own one.
  const [deckLimit, setDeckLimit] = useState(String(DEFAULT_DECK_LIMIT));
  const [fieldLimit, setFieldLimit] = useState(String(DEFAULT_FIELD_LIMIT));
  // How Overlap joins the two tests. AND is the narrow question ("a staple of a
  // deck that the whole field also plays"), thus it is the default.
  const [combine, setCombine] = useState('and');
  const [phase, setPhase] = useState('idle'); // idle | legends | maps | staples | done | error
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
      card,
      x: Math.min(x + 18, window.innerWidth - PREVIEW_W - 8),
      y: Math.min(Math.max(y - PREVIEW_H / 2, 8), window.innerHeight - PREVIEW_H - 8),
    });
  };

  const effectiveId = customId.trim() || metagameId;

  const run = async () => {
    const { deckSide, fieldSide } = MODES[mode];
    // Overlap reads the staples list first, because that is the one request.
    setPhase(fieldSide ? 'staples' : 'legends');
    setError(null);
    setResult(null);
    setDecksId(null);
    try {
      // key -> Map(legend name -> the usage row), one map for each source, so
      // Overlap can test the two of them separately. The keys are the same
      // three the bulk analyzer uses, because the riftdecks ids do not match
      // the DotGG ids. A legend appears one time per key, at its highest play
      // rate, thus a card that resolves on two keys cannot count one deck two
      // times.
      const deckUsage = new Map();
      const fieldUsage = new Map();
      const record = (usage, key, entry) => {
        if (!key) return;
        const byLegend = usage.get(key) || new Map();
        const prev = byLegend.get(entry.legend);
        if (!prev || entry.playRate > prev.playRate) byLegend.set(entry.legend, entry);
        usage.set(key, byLegend);
      };

      let allLegends = [];
      let fetchedAt = null;
      let source = null;

      if (fieldSide) {
        const staples = await api.getStaples();
        source = {
          cardCount: staples.cards.length,
          fetchedAt: staples.fetchedAt,
          // The walk stops at this popularity, thus a lower limit cannot show
          // more cards and the page has to say so.
          minPopularity: staples.minPopularity,
        };
        for (const c of staples.cards) {
          const entry = {
            legend: FIELD_LEGEND,
            legendShare: null,
            name: c.name,
            playRate: c.popularity,
            copies: c.copies ?? null,
            decks: null,
            winRate: null,
          };
          // The collector number and the image disagree for the runes
          // ("VEN-R02" against the OGN image), thus both ids are keys.
          for (const id of [c.cardId, c.imgCardId]) {
            if (!id) continue;
            record(fieldUsage, id.toUpperCase(), entry);
            record(fieldUsage, stripVariant(id.toUpperCase()), entry);
          }
          record(fieldUsage, `n:${normName(c.name)}`, entry);
        }
      }

      if (deckSide) {
        setPhase('legends');
        const legendsRes = await api.getMetaLegends(effectiveId);
        // Every legend on the page counts, at any metashare: one deck that
        // plays a card in almost every list makes it a staple of that deck.
        allLegends = legendsRes.legends;
        fetchedAt = legendsRes.fetchedAt;

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
              record(deckUsage, c.cardId.toUpperCase(), entry);
              record(deckUsage, stripVariant(c.cardId.toUpperCase()), entry);
            }
            record(deckUsage, `n:${normName(c.name)}`, entry);
          }
          setProgress({ current: i + 1, total: allLegends.length, name: legend.name });
        }
      }

      // Blank or nonsense input falls back to the default of the measure rather
      // than analyzing against NaN. A limit the mode does not use stays null,
      // thus no text can quote a number the run never applied.
      const limitOf = (raw, dflt) => (raw !== '' && Number(raw) >= 0 ? Number(raw) : dflt);
      const limits = {
        deck: deckSide ? limitOf(deckLimit, DEFAULT_DECK_LIMIT) : null,
        field: fieldSide ? limitOf(fieldLimit, DEFAULT_FIELD_LIMIT) : null,
      };

      // One row for each real card, and not for each printing: the list must
      // not hold the same card three times because it has two alt arts.
      const pool = dedupeByIdentity(cards.filter(isBasePrinting));

      const matchedNames = new Set();
      // The three keys of one card against one source, kept at the highest rate
      // for each legend, thus a card that resolves on two keys cannot count one
      // deck two times.
      const hitsFor = (usage, card, limit) => {
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
        for (const entry of byLegend.values()) matchedNames.add(normName(entry.name));
        return [...byLegend.values()]
          .filter((e) => e.playRate > limit)
          .sort((a, b) => b.playRate - a.playRate || a.legend.localeCompare(b.legend));
      };

      const rows = [];
      for (const card of pool) {
        const deckHits = deckSide ? hitsFor(deckUsage, card, limits.deck) : [];
        const fieldHits = fieldSide ? hitsFor(fieldUsage, card, limits.field) : [];
        // Overlap joins the two tests with the operator of the run. AND asks
        // for a card that passes the two of them, OR for a card that passes
        // either one.
        const pass =
          mode === 'overlap'
            ? combine === 'and'
              ? deckHits.length > 0 && fieldHits.length > 0
              : deckHits.length > 0 || fieldHits.length > 0
            : deckSide
              ? deckHits.length > 0
              : fieldHits.length > 0;
        if (!pass) continue;

        rows.push({
          card,
          // The popup shows the two sources in one table, the meta decks first.
          decks: [...deckHits, ...fieldHits],
          deckRate: deckHits.length > 0 ? deckHits[0].playRate : null,
          fieldRate: fieldHits.length > 0 ? fieldHits[0].playRate : null,
          topLegend: deckHits.length > 0 ? deckHits[0].legend : null,
          deckCount: deckHits.length,
          price: effectivePrice(card) ?? 0,
        });
      }

      // A meta card above the limit that the card database never matched can
      // never reach a list, thus the run says so rather than losing it in
      // silence. Each source is measured against its own limit.
      const unmatched = new Set();
      for (const [usage, limit] of [
        [deckUsage, limits.deck],
        [fieldUsage, limits.field],
      ]) {
        for (const byLegend of usage.values()) {
          for (const entry of byLegend.values()) {
            if (entry.playRate > limit && !matchedNames.has(normName(entry.name))) {
              unmatched.add(entry.name);
            }
          }
        }
      }

      // A sort that reads a rate the run never made would order nothing.
      // "Decks above limit" also counts one pseudo-deck on every row of a Field
      // run, thus that mode does not offer it.
      if (!fieldSide && sort === 'popularity') setSort('playRate');
      if (!deckSide && (sort === 'playRate' || sort === 'decks')) setSort('popularity');

      setResult({
        // Captured so every label and every text describes the run that made
        // these lists, and not whatever the controls say now.
        mode,
        combine,
        metagameId: effectiveId,
        fetchedAt,
        allLegends,
        source,
        rows,
        unmatched: [...unmatched].sort(),
        limits,
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

  // Common and Uncommon are one choice: a staple at those two rarities is the
  // same question ("which inexpensive card does the meta play"), and the split
  // only made the user look two times.
  const rarityOptions = useMemo(() => {
    const has = (r) => allRows.some((e) => e.card.rarity === r);
    const out = [];
    if (has('Common') || has('Uncommon')) {
      out.push({ value: LOW_RARITY, label: 'Common / Uncommon' });
    }
    for (const r of RARITIES) {
      if (!LOW_RARITIES.includes(r) && has(r)) out.push({ value: r, label: r });
    }
    return out;
  }, [allRows]);

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
          if (rarityFilter !== 'any') {
            const list = rarityFilter === LOW_RARITY ? LOW_RARITIES : [rarityFilter];
            if (!list.includes(e.card.rarity)) return false;
          }
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

  // The two modes measure different things, thus the file says which one made
  // it, both in the rate column and in the name.
  const exportCsv = () => {
    const { deckSide, fieldSide } = MODES[result.mode];
    const head = [
      'CardId,Name,Set,Rarity,CopiesOwned,Price,TotalValue',
      deckSide ? 'TopPlayRate,TopLegend,DecksAboveLimit' : '',
      fieldSide ? 'Popularity,AverageFieldCopies' : '',
    ]
      .filter(Boolean)
      .join(',');
    const lines = [head];
    for (const e of [...visibleOwned, ...visibleMissing]) {
      // The field row is the last of the list, thus it is the one to read for
      // the average copies of the whole format.
      const fieldRow = e.decks[e.decks.length - 1];
      const cells = [
        `${e.card.id}`,
        csvCell(e.card.name),
        e.card.setCode,
        e.card.rarity,
        e.copies,
        e.price.toFixed(2),
        e.value.toFixed(2),
      ];
      if (deckSide) cells.push(e.deckRate ?? '', csvCell(e.topLegend ?? ''), e.deckCount);
      if (fieldSide) cells.push(e.fieldRate ?? '', e.fieldRate == null ? '' : (fieldRow.copies ?? ''));
      lines.push(cells.join(','));
    }
    const name =
      result.mode === 'field'
        ? 'staples-field.csv'
        : result.mode === 'deck'
          ? `staples-metagame-${result.metagameId}.csv`
          : `staples-overlap-${result.combine}-${result.metagameId}.csv`;
    downloadText(name, lines.join('\n'));
  };

  const running = phase === 'legends' || phase === 'maps' || phase === 'staples';
  const decksRow = decksId ? allRows.find((e) => e.card.id === decksId) : null;
  // The mode of the run, and not of the controls: the table must not relabel
  // its columns while the user picks the next run.
  const resultMode = result?.mode ?? 'deck';
  const tableProps = {
    mode: resultMode,
    onOpen: setDecksId,
    onHover: showHover,
    onToggleKeep: toggleCardTag,
  };

  const resultSides = MODES[resultMode];

  // The one sentence that states the rule of the run, in the words of the mode.
  // It reads the limits of the run, thus a control that moves after the run
  // cannot make the text disagree with the list.
  const ruleText = !result
    ? ''
    : resultMode === 'deck'
      ? `The meta plays each of these in more than ${result.limits.deck}% of the lists of a minimum of one deck`
      : resultMode === 'field'
        ? `The format plays each of these at more than ${result.limits.field}% popularity`
        : `Each of these is above ${result.limits.deck}% play rate in a minimum of one deck ${result.combine.toUpperCase()} above ${result.limits.field}% popularity in the whole field`;

  // A switch gives the defaults again, thus a 50 that a Deck-based run left
  // behind cannot empty the popularity test of the next run.
  const changeMode = (next) => {
    setMode(next);
    setDeckLimit(String(DEFAULT_DECK_LIMIT));
    setFieldLimit(String(DEFAULT_FIELD_LIMIT));
  };

  return (
    <div>
      <h1 className="page-title">Staples Analyzer</h1>

      <div className="bulk-controls">
        <label className="field">
          <span>Mode</span>
          <select value={mode} onChange={(e) => changeMode(e.target.value)}>
            {Object.entries(MODES).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {/* The whole-format list has no metagame, thus the two id controls
            belong to the modes that read the meta maps. */}
        {MODES[mode].deckSide && (
          <>
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
          </>
        )}
        {/* One input for each measure the mode uses. Overlap shows the two of
            them, and the operator between them. */}
        {MODES[mode].deckSide && (
          <label className="field">
            <span>{DECK_LIMIT_LABEL}</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={deckLimit}
              onChange={(e) => setDeckLimit(e.target.value)}
              style={{ width: 110 }}
            />
          </label>
        )}
        {mode === 'overlap' && (
          <label className="field">
            <span>Join</span>
            <select value={combine} onChange={(e) => setCombine(e.target.value)}>
              <option value="and">AND (both limits)</option>
              <option value="or">OR (either limit)</option>
            </select>
          </label>
        )}
        {MODES[mode].fieldSide && (
          <label className="field">
            <span>{FIELD_LIMIT_LABEL}</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={fieldLimit}
              onChange={(e) => setFieldLimit(e.target.value)}
              style={{ width: 110 }}
            />
          </label>
        )}
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Analyzing…' : 'Find staples'}
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
            {/* An Overlap run reads the two sources, thus it counts the two. */}
            {resultSides.deckSide && (
              <div className="stat-box">
                <div className="v">{result.allLegends.length}</div>
                <div className="k">Meta decks checked</div>
              </div>
            )}
            {resultSides.fieldSide && (
              <div className="stat-box">
                <div className="v">{result.source.cardCount}</div>
                <div className="k">Cards on the staples list</div>
              </div>
            )}
          </div>

          <div className="section-head">
            <h3>{resultMode === 'field' ? 'Source' : 'Meta decks scanned'}</h3>
            <span className="muted">
              data fetched{' '}
              {new Date(resultSides.deckSide ? result.fetchedAt : result.source.fetchedAt)
                .toLocaleString()}{' '}
              — <Link to="/config">refresh fresh meta data</Link> on the Config page
            </span>
          </div>
          {resultSides.deckSide && (
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
          )}
          {resultSides.fieldSide && (
            <p className="muted" style={{ marginBottom: 14 }}>
              The most played cards of every Constructed deck of the last 30 days, fetched{' '}
              {new Date(result.source.fetchedAt).toLocaleString()}. Popularity is a share of the
              most played card, and not a share of the lists.
              {/* The walk down the paged list stops at this value, thus a lower
                  limit cannot find more cards and the page says so. */}
              {result.limits.field < result.source.minPopularity
                ? ` The list stops at ${result.source.minPopularity}%, thus a limit below that shows no more cards.`
                : ''}
            </p>
          )}

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
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="spacer" />
            <span className="count-note">
              owned: {visibleOwned.length} · missing: {visibleMissing.length}
            </span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {/* One sort for each measure the run made. A sort on a rate the
                  run never read would order nothing. */}
              {resultSides.deckSide && <option value="playRate">Sort: Play rate</option>}
              {resultSides.fieldSide && <option value="popularity">Sort: Popularity</option>}
              {/* One pseudo-deck for every row of a Field run, thus this sort
                  would keep the list as it is. */}
              {resultSides.deckSide && <option value="decks">Sort: Decks above limit</option>}
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
              {ruleText}, and you have a copy. Click the thumbnail to see the numbers behind the
              row.
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
            <p className="muted">{ruleText}, and you have no copy in any printing.</p>
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
        <CardArt
          className="card-hover-preview"
          card={hover.card}
          style={{ left: hover.x, top: hover.y, width: PREVIEW_W }}
        />
      )}

      {decksRow && !detailId && (
        <MetaDecksModal
          row={decksRow}
          owned={decksRow.owned}
          limits={result.limits}
          mode={resultMode}
          combine={result.combine}
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
