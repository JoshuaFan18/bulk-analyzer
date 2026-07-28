import React, { useMemo, useState } from 'react';
import { useApp } from '../state.jsx';
import { isToken } from '../lib/cards.js';

export default function ConfigPage() {
  const { cards, importPower, importingPower } = useApp();
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(null);

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
