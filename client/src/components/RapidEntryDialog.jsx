import React, { useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../state.jsx';
import { SET_RELEASE_ORDER, money, setLabel } from '../lib/cards.js';
import {
  buildPromoIndex,
  committedCopies,
  resolveRapidEntry,
  sessionTotals,
  sessionValue,
} from '../lib/rapidEntry.js';

const LEGEND = [
  ['3', 'normal'],
  ['3+', 'foil'],
  ['3p', 'promo'],
  ['10x3', '3 copies'],
  ['-3', 'remove'],
];

// Copies of one printing/finish this session has queued but not committed.
function sessionNet(entries, cardId, kind) {
  let n = 0;
  for (const e of entries) if (e.cardId === cardId && e.kind === kind) n += e.delta;
  return n;
}

export default function RapidEntryDialog({ onClose }) {
  const { cards, cardsById, collection, mergeCollection } = useApp();

  const setNames = useMemo(() => {
    const seen = new Map();
    for (const c of cards) if (!seen.has(c.setCode)) seen.set(c.setCode, setLabel(c));
    return [...seen.entries()].sort(
      (a, b) => SET_RELEASE_ORDER.indexOf(a[0]) - SET_RELEASE_ORDER.indexOf(b[0])
    );
  }, [cards]);

  // Newest set first — that is the box most likely being opened.
  const [setCode, setSetCode] = useState(() => setNames[setNames.length - 1]?.[0] || 'OGN');
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  // Newest first: { key, cardId, kind, delta, autoFinish }
  const [entries, setEntries] = useState([]);
  const keyRef = useRef(0);
  const inputRef = useRef(null);

  const promoIndex = useMemo(() => buildPromoIndex(cards), [cards]);

  const totals = useMemo(() => sessionTotals(entries), [entries]);
  const copies = useMemo(() => entries.reduce((s, e) => s + e.delta, 0), [entries]);
  const value = useMemo(() => sessionValue(totals, cardsById), [totals, cardsById]);

  const ownedOf = (cardId, kind) =>
    committedCopies(collection, cardId, kind) + sessionNet(entries, cardId, kind);

  const push = ({ cardId, kind, delta, autoFinish }) =>
    setEntries((prev) => [{ key: keyRef.current++, cardId, kind, delta, autoFinish }, ...prev]);

  const submit = (raw) => {
    const res = resolveRapidEntry(setCode, raw, { cardsById, promoIndex, ownedOf });
    if (res.error) {
      setError(res.error);
      return;
    }
    push({ cardId: res.card.id, kind: res.kind, delta: res.delta, autoFinish: res.autoFinish });
    setError(null);
    setInput('');
  };

  const repeatLast = () => {
    const last = entries[0];
    if (!last) return;
    if (last.delta < 0 && ownedOf(last.cardId, last.kind) + last.delta < 0) {
      setError(`Nothing to remove — no ${last.kind} ${last.cardId}`);
      return;
    }
    push(last);
    setError(null);
  };

  // The buttons duplicate keystrokes, so they hand focus straight back — losing
  // it would silently break Enter/Backspace until the box is clicked again.
  const undoLast = () => {
    setEntries((prev) => prev.slice(1));
    setError(null);
    inputRef.current?.focus();
  };

  const clearAll = () => {
    setEntries([]);
    setError(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim()) submit(input);
      else repeatLast();
      return;
    }
    // Backspace on an empty box undoes, so a misheard number is one keystroke
    // away from being taken back without leaving the input.
    if (e.key === 'Backspace' && !input) {
      e.preventDefault();
      undoLast();
      return;
    }
    // Escape clears the box but must not close the dialog — an uncommitted
    // session is otherwise one stray keypress from being lost.
    if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
      setError(null);
    }
  };

  const guardedClose = () => {
    if (entries.length > 0 && !window.confirm(`Discard ${entries.length} uncommitted entries?`)) {
      return;
    }
    onClose();
  };

  const commit = () => {
    if (totals.size === 0) return;
    mergeCollection(Object.fromEntries(totals));
    onClose();
  };

  return (
    <Modal title="Rapid entry" className="wide" onClose={guardedClose}>
      <p className="muted rapid-sub">
        Call cards, type numbers. Built for two people — one reads, one types.
      </p>

      <div className="rapid-head">
        <label className="inline">
          <span className="rapid-label">SET</span>
          <select
            value={setCode}
            onChange={(e) => {
              setSetCode(e.target.value);
              setError(null);
              inputRef.current?.focus();
            }}
          >
            {setNames.map(([code, label]) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <div className="rapid-legend">
          {LEGEND.map(([token, label]) => (
            <span key={token}>
              <code>{token}</code> {label}
            </span>
          ))}
        </div>
      </div>

      <div className="rapid-entry-row">
        <div className={`rapid-input ${error ? 'has-error' : ''}`} onClick={() => inputRef.current?.focus()}>
          <span className="rapid-prefix">{setCode}-</span>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            placeholder="type a number…"
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="rapid-hint">
          {error ? (
            <span className="warn">{error}</span>
          ) : entries.length > 0 ? (
            <>
              <kbd>Enter</kbd> repeats the last entry · <kbd>Backspace</kbd> undoes it
            </>
          ) : (
            <>
              Enter a card number and press <kbd>Enter</kbd>
            </>
          )}
        </div>
      </div>

      <div className="rapid-panes">
        <div className="rapid-pane">
          <div className="rapid-pane-head">
            <span>HISTORY</span>
            <span className="muted">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="rapid-list">
            {entries.length === 0 && (
              <div className="rapid-empty">Your keystrokes appear here, newest on top.</div>
            )}
            {entries.map((e) => {
              const card = cardsById.get(e.cardId);
              return (
                <div className="rapid-row" key={e.key}>
                  <code>{e.cardId}</code>
                  <span className="rapid-name">{card?.name || '—'}</span>
                  <span className={`pill ${e.kind === 'foil' ? 'gold' : ''}`}>
                    {e.kind.toUpperCase()}
                    {e.autoFinish ? '·auto' : ''}
                  </span>
                  <span className="muted">
                    {money(e.kind === 'foil' ? card?.foilPrice : card?.price)}
                  </span>
                  <span className={e.delta < 0 ? 'rapid-delta neg' : 'rapid-delta'}>
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rapid-pane">
          <div className="rapid-pane-head">
            <span>OVERVIEW</span>
            <span className="muted">
              {totals.size} {totals.size === 1 ? 'card' : 'cards'}
            </span>
          </div>
          <div className="rapid-list">
            {totals.size === 0 && (
              <div className="rapid-empty">A compact per-card tally builds up here.</div>
            )}
            {[...totals].map(([cardId, acc]) => {
              const card = cardsById.get(cardId);
              return (
                <div className="rapid-row" key={cardId}>
                  <code>{cardId}</code>
                  <span className="rapid-name">{card?.name || '—'}</span>
                  <span className="rapid-tally">
                    N:{acc.normal} <span className="muted">F:{acc.foil}</span>
                  </span>
                  <span className="muted">
                    {money(acc.normal * (card?.price || 0) + acc.foil * (card?.foilPrice || 0))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="modal-actions rapid-actions">
        <div className="rapid-stats">
          <div className="stat-box">
            <div className="v">{entries.length}</div>
            <div className="k">Entries</div>
          </div>
          <div className="stat-box">
            <div className="v">{totals.size}</div>
            <div className="k">Cards</div>
          </div>
          <div className="stat-box">
            <div className="v">{copies}</div>
            <div className="k">Copies</div>
          </div>
          <div className="stat-box">
            <div className="v">{money(value)}</div>
            <div className="k">Session value</div>
          </div>
        </div>
        <span className="spacer" />
        <button onClick={undoLast} disabled={entries.length === 0}>
          Undo last
        </button>
        <button onClick={clearAll} disabled={entries.length === 0}>
          Clear
        </button>
        <button className="primary" onClick={commit} disabled={totals.size === 0}>
          ✓ Commit to your main collection
        </button>
      </div>
    </Modal>
  );
}
