import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import { isToken, money, normName } from '../lib/cards.js';
import { csvCell, downloadText } from '../lib/download.js';
import { KEEP_TAG, hasTag } from '../lib/tags.js';

const DEFAULT_PRICE_LIMIT = 0.25;
const DEFAULT_PLAY_RATE_LIMIT = 10;

const PRESETS = [
  { id: '1', label: 'Origins (1)' },
  { id: '2', label: 'Spiritforged (2)' },
  { id: '3', label: 'Unleashed (3)' },
  { id: '4', label: 'Vendetta (4)' },
];

const stripVariant = (id) => String(id).replace(/([0-9])[a-z]$/i, '$1');

export default function BulkAnalyzerPage() {
  const { cards, collection, tags } = useApp();
  const [metagameId, setMetagameId] = useState('1');
  const [customId, setCustomId] = useState('');
  const [priceLimit, setPriceLimit] = useState(String(DEFAULT_PRICE_LIMIT));
  const [playRateLimit, setPlayRateLimit] = useState(String(DEFAULT_PLAY_RATE_LIMIT));
  const [refresh, setRefresh] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | legends | maps | done | error
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
        if (hasTag(tags, card.id, KEEP_TAG)) {
          keptCount += 1;
          continue;
        }

        const price = card.price;
        if (price == null || price <= 0) {
          unknownPrice += 1;
          continue;
        }
        if (price >= maxPrice) continue;

        const use = lookupUsage(card);
        const entry = {
          card,
          copies: normalOwned,
          price,
          value: normalOwned * price,
          playRate: use?.playRate ?? 0,
          legend: use?.legend ?? null,
        };
        if (use && use.playRate > maxPlayRate) protectedCards.push(entry);
        else bulk.push(entry);
      }

      bulk.sort((a, b) => b.value - a.value);
      protectedCards.sort((a, b) => b.playRate - a.playRate);

      setResult({
        metagameId: effectiveId,
        fetchedAt: legendsRes.fetchedAt,
        allLegends,
        metaLegends,
        bulk,
        protectedCards,
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

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      unique: result.bulk.length,
      copies: result.bulk.reduce((s, e) => s + e.copies, 0),
      value: result.bulk.reduce((s, e) => s + e.value, 0),
    };
  }, [result]);

  const exportCsv = () => {
    const lines = ['CardId,Name,Set,Rarity,NormalCopies,Price,TotalValue,MaxMetaPlayRate'];
    for (const e of result.bulk) {
      lines.push(
        `${e.card.id},${csvCell(e.card.name)},${e.card.setCode},${e.card.rarity},${
          e.copies
        },${e.price.toFixed(2)},${e.value.toFixed(2)},${e.playRate}`
      );
    }
    downloadText(`true-bulk-metagame-${result.metagameId}.csv`, lines.join('\n'));
  };

  const running = phase === 'legends' || phase === 'maps';

  // Before a run the prose describes what the inputs will do; after one it
  // describes the table on screen.
  const shownPrice = result ? result.priceLimit : Number(priceLimit) || DEFAULT_PRICE_LIMIT;
  const shownPlayRate = result
    ? result.playRateLimit
    : Number(playRateLimit) || DEFAULT_PLAY_RATE_LIMIT;

  return (
    <div>
      <h1 className="page-title">True Bulk Analyzer</h1>
      <p className="page-sub">
        True bulk = commons and uncommons worth under {money(shownPrice)} (normal printing)
        that are not played above {shownPlayRate}% in any meta deck on riftdecks.com. Runes,
        tokens, and cards you tagged {KEEP_TAG} are excluded. Only normal copies you own are
        counted — foils are never bulk.
      </p>

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

          <div className="section-head">
            <h3>True bulk ({result.bulk.length})</h3>
            <button onClick={exportCsv} disabled={result.bulk.length === 0}>
              Export CSV
            </button>
          </div>
          {result.bulk.length === 0 ? (
            <p className="muted">
              No true bulk found — none of your owned commons/uncommons matched the rule.
            </p>
          ) : (
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
                </tr>
              </thead>
              <tbody>
                {result.bulk.map((e) => (
                  <tr key={e.card.id}>
                    <td>
                      {e.card.name} <span className="muted">{e.card.id}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <details className="panel">
            <summary>
              Cheap but protected by meta play ({result.protectedCards.length})
            </summary>
            <p className="muted">
              These commons/uncommons are worth under {money(result.priceLimit)} but exceed{' '}
              {result.playRateLimit}% play rate in at least one meta deck, so they are not true
              bulk.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Card</th>
                  <th className="num">Normal copies</th>
                  <th className="num">Price</th>
                  <th className="num">Play rate</th>
                  <th>In deck</th>
                </tr>
              </thead>
              <tbody>
                {result.protectedCards.map((e) => (
                  <tr key={e.card.id}>
                    <td>
                      {e.card.name} <span className="muted">{e.card.id}</span>
                    </td>
                    <td className="num">{e.copies}</td>
                    <td className="num">{money(e.price)}</td>
                    <td className="num">{e.playRate}%</td>
                    <td>{e.legend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          {result.unknownPrice > 0 && (
            <p className="muted" style={{ marginTop: 10 }}>
              {result.unknownPrice} owned common/uncommon card(s) had no usable price data and were
              left out of the bulk list to be safe.
            </p>
          )}
          {result.keptCount > 0 && (
            <p className="muted" style={{ marginTop: 4 }}>
              {result.keptCount} owned common/uncommon card(s) were skipped because you tagged them{' '}
              {KEEP_TAG}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
