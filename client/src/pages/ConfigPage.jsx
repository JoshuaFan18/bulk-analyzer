import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../state.jsx';
import { METAGAME_PRESETS, isToken } from '../lib/cards.js';

export default function ConfigPage() {
  const { cards, importPower, importingPower } = useApp();
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(null);

  const [metagameId, setMetagameId] = useState('1');
  const [customId, setCustomId] = useState('');
  const [metaPhase, setMetaPhase] = useState('idle'); // idle | legends | maps | done | error
  const [metaProgress, setMetaProgress] = useState({ current: 0, total: 0, name: '' });
  const [metaResult, setMetaResult] = useState(null);
  const [metaError, setMetaError] = useState(null);

  const effectiveMetagameId = customId.trim() || metagameId;
  const refreshingMeta = metaPhase === 'legends' || metaPhase === 'maps';

  // Forces riftdecks.com re-scrapes for every legend of one metagame and
  // repopulates data/meta-cache/, so the Bulk Analyzer's own run can stay a
  // cache-only read and never itself decide to hit the site.
  const refreshMeta = async () => {
    setMetaPhase('legends');
    setMetaError(null);
    setMetaResult(null);
    try {
      const legendsRes = await api.getMetaLegends(effectiveMetagameId, true);
      const allLegends = legendsRes.legends;
      setMetaPhase('maps');
      setMetaProgress({ current: 0, total: allLegends.length, name: '' });
      for (let i = 0; i < allLegends.length; i++) {
        const legend = allLegends[i];
        setMetaProgress({ current: i, total: allLegends.length, name: legend.name });
        await api.getMetaMap(effectiveMetagameId, legend.slug, true);
        setMetaProgress({ current: i + 1, total: allLegends.length, name: legend.name });
      }
      setMetaResult({ metagameId: effectiveMetagameId, legendCount: allLegends.length });
      setMetaPhase('done');
    } catch (e) {
      setMetaError(e.message);
      setMetaPhase('error');
    }
  };

  // Mirrors hasPowerConcept in server/power.js. Legends, Battlefields and Runes
  // have no cost, and the double-faced tokens carry cost 0 but no power, so
  // counting either would report a shortfall no import could ever close.
  const { eligible, missing } = useMemo(() => {
    const withPower = cards.filter((c) => c.cost != null && !isToken(c));
    return { eligible: withPower, missing: withPower.filter((c) => c.power == null) };
  }, [cards]);

  const covered = eligible.length - missing.length;
  const pct = eligible.length ? Math.round((covered / eligible.length) * 100) : 0;

  const run = async () => {
    setResult(null);
    setFailed(null);
    try {
      setResult(await importPower(missing.map((c) => c.id)));
    } catch (e) {
      setFailed(e.message);
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">Config</h2>
      <p className="page-sub">Settings and data maintenance for the card database.</p>

      <div className="section-head">
        <h3>Meta data</h3>
      </div>

      <p className="muted">
        The Bulk Analyzer's "protected by meta play" check reads riftdecks.com through a cache in{' '}
        <code>data/meta-cache/</code>. Refresh here before a run to force fresh scrapes for every
        legend of one metagame; the analyzer itself always reads whatever the cache holds.
      </p>

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
        <button onClick={refreshMeta} disabled={refreshingMeta}>
          {refreshingMeta ? 'Refreshing…' : 'Refresh meta data'}
        </button>
      </div>

      {metaPhase === 'legends' && (
        <div className="bulk-progress">Fetching legends for metagame {effectiveMetagameId}…</div>
      )}
      {metaPhase === 'maps' && (
        <div className="bulk-progress">
          Fetching meta maps ({metaProgress.current} / {metaProgress.total})
          {metaProgress.name ? ` — ${metaProgress.name}` : ''}
          <div className="bar">
            <div
              style={{
                width: `${
                  metaProgress.total ? (metaProgress.current / metaProgress.total) * 100 : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}
      {metaPhase === 'error' && <div className="error-banner">Refresh failed: {metaError}</div>}
      {metaResult && metaPhase === 'done' && (
        <p className="muted">
          Refreshed {metaResult.legendCount} legend(s) for metagame {metaResult.metagameId}.
        </p>
      )}

      <div className="section-head">
        <h3>Power costs</h3>
        <span className="muted">
          {covered} of {eligible.length} cost-bearing cards ({pct}%)
        </span>
      </div>

      <p className="muted">
        The DotGG feed carries only the energy cost, so power is filled in from
        api.riftcodex.com.{' '}
        {missing.length > 0
          ? `Importing resolves the ${missing.length} card${
              missing.length === 1 ? '' : 's'
            } still missing a power cost and leaves everything already known untouched.`
          : 'Anything a future set adds will show up here as missing until imported.'}
      </p>

      <div className="toolbar">
        <button onClick={run} disabled={importingPower || missing.length === 0}>
          {importingPower ? 'Importing power…' : 'Import Power'}
        </button>
        {missing.length === 0 && !result && (
          <span className="count-note">Every eligible card already has a power cost.</span>
        )}
      </div>

      {failed && <p className="muted">Import failed: {failed}</p>}

      {result && (
        <div className="panel">
          <p>
            Imported {result.added} power cost{result.added === 1 ? '' : 's'} from{' '}
            {result.source}.
          </p>
          {result.unresolved?.length > 0 && (
            <details>
              <summary className="muted">
                {result.unresolved.length} card
                {result.unresolved.length === 1 ? '' : 's'} could not be resolved
              </summary>
              <ul>
                {result.unresolved.map((u) => (
                  <li key={u.id} className="muted">
                    {u.id} — {u.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.conflicts?.length > 0 && (
            <details>
              <summary className="muted">
                {result.conflicts.length} printing conflict
                {result.conflicts.length === 1 ? '' : 's'}
              </summary>
              <ul>
                {result.conflicts.map((c) => (
                  <li key={c} className="muted">
                    {c}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
