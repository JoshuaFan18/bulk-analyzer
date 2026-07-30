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

// The two columns of the trade screen. "away" leaves the collection, "return"
// enters it; the component reads per-side state off these.
const TRADE_PANES = [
  {
    side: 'away',
    title: 'TRADING AWAY',
    placeholder: 'e.g. OGN-007',
    empty: 'Cards you give leave your collection.',
  },
  {
    side: 'return',
    title: 'GETTING IN RETURN',
    placeholder: 'e.g. SFD-042',
    empty: 'Cards you receive are added.',
  },
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

  // Two screens share this dialog: 'pack' (the original box-opening flow) and
  // 'trade' (two boxes — cards given away and cards received). The light switch
  // flips between them.
  const [mode, setMode] = useState('pack');

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
    const dirty = entries.length + awayEntries.length + returnEntries.length;
    if (dirty > 0 && !window.confirm(`Discard ${dirty} uncommitted entries?`)) {
      return;
    }
    onClose();
  };

  const commit = () => {
    if (totals.size === 0) return;
    mergeCollection(Object.fromEntries(totals));
    onClose();
  };

  // ---- Trade screen -------------------------------------------------------
  // Two independent boxes. The set id is typed in full here (no dropdown, no
  // auto-prefix), so a trade can span sets. "Away" entries are removals
  // (negative deltas), "return" entries are additions (positive). Either side
  // may stay empty. One commit applies both directions to the collection.
  const [awayInput, setAwayInput] = useState('');
  const [returnInput, setReturnInput] = useState('');
  const [awayError, setAwayError] = useState(null);
  const [returnError, setReturnError] = useState(null);
  const [awayEntries, setAwayEntries] = useState([]);
  const [returnEntries, setReturnEntries] = useState([]);
  const awayRef = useRef(null);
  const returnRef = useRef(null);

  const awayTotals = useMemo(() => sessionTotals(awayEntries), [awayEntries]);
  const returnTotals = useMemo(() => sessionTotals(returnEntries), [returnEntries]);
  const awayValue = useMemo(() => sessionValue(awayTotals, cardsById), [awayTotals, cardsById]);
  const returnValue = useMemo(
    () => sessionValue(returnTotals, cardsById),
    [returnTotals, cardsById]
  );

  // A removal can only take copies the collection actually holds, counting the
  // copies already queued away this session (their deltas are negative).
  const awayOwnedOf = (cardId, kind) =>
    committedCopies(collection, cardId, kind) + sessionNet(awayEntries, cardId, kind);

  // Split "OGN-007" into the set code and the rest of the token the shared
  // resolver understands. The dash is optional, so "ogn7" works too.
  const SET_ID = /^([A-Za-z]{2,4})[-\s]?(.+)$/;

  const submitTrade = (side, raw) => {
    const setError = side === 'away' ? setAwayError : setReturnError;
    const m = String(raw).trim().match(SET_ID);
    if (!m) {
      setError('Type a full card id, e.g. OGN-007');
      return;
    }
    const setCode = m[1].toUpperCase();
    // The away box records removals, so its token is resolved as a negative.
    const token = side === 'away' ? `-${m[2]}` : m[2];
    const res = resolveRapidEntry(setCode, token, {
      cardsById,
      promoIndex,
      ownedOf: awayOwnedOf,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    const entry = {
      key: keyRef.current++,
      cardId: res.card.id,
      kind: res.kind,
      delta: res.delta,
      autoFinish: res.autoFinish,
    };
    if (side === 'away') {
      setAwayEntries((prev) => [entry, ...prev]);
      setAwayError(null);
      setAwayInput('');
    } else {
      setReturnEntries((prev) => [entry, ...prev]);
      setReturnError(null);
      setReturnInput('');
    }
  };

  const undoTrade = (side) => {
    if (side === 'away') {
      setAwayEntries((prev) => prev.slice(1));
      setAwayError(null);
      awayRef.current?.focus();
    } else {
      setReturnEntries((prev) => prev.slice(1));
      setReturnError(null);
      returnRef.current?.focus();
    }
  };

  const tradeKeyDown = (side) => (e) => {
    const input = side === 'away' ? awayInput : returnInput;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim()) submitTrade(side, input);
      return;
    }
    if (e.key === 'Backspace' && !input) {
      e.preventDefault();
      undoTrade(side);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (side === 'away') {
        setAwayInput('');
        setAwayError(null);
      } else {
        setReturnInput('');
        setReturnError(null);
      }
    }
  };

  const tradeDirty = awayEntries.length + returnEntries.length;

  const commitTrade = () => {
    const totalsTrade = sessionTotals([...awayEntries, ...returnEntries]);
    if (totalsTrade.size === 0) return;
    mergeCollection(Object.fromEntries(totalsTrade));
    onClose();
  };

  return (
    <Modal title="Rapid entry" className="wide" onClose={guardedClose}>
      <div className="rapid-mode-row">
        <button
          type="button"
          className={`rapid-switch ${mode === 'trade' ? 'trade' : 'pack'}`}
          role="switch"
          aria-checked={mode === 'trade'}
          onClick={() => setMode((m) => (m === 'pack' ? 'trade' : 'pack'))}
        >
          <span className="rapid-switch-side left">Pack</span>
          <span className="rapid-switch-side right">Trade</span>
          <span className="rapid-switch-knob" />
        </button>
      </div>

      {mode === 'pack' ? (
        <>
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
        </>
      ) : (
        <>
          <p className="muted rapid-sub">
            Enter the full card id on each side — the set is not filled in for you. Leave a side
            empty if the trade is one-way.
          </p>

          <div className="rapid-trade">
            {TRADE_PANES.map((pane) => {
              const isAway = pane.side === 'away';
              const input = isAway ? awayInput : returnInput;
              const setInput = isAway ? setAwayInput : setReturnInput;
              const paneError = isAway ? awayError : returnError;
              const setPaneError = isAway ? setAwayError : setReturnError;
              const paneEntries = isAway ? awayEntries : returnEntries;
              const ref = isAway ? awayRef : returnRef;
              return (
                <div className="rapid-trade-pane" key={pane.side}>
                  <div className="rapid-pane-head">
                    <span>{pane.title}</span>
                    <span className="muted">
                      {paneEntries.length} {paneEntries.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>

                  <div
                    className={`rapid-input ${paneError ? 'has-error' : ''}`}
                    onClick={() => ref.current?.focus()}
                  >
                    <input
                      ref={ref}
                      value={input}
                      placeholder={pane.placeholder}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setPaneError(null);
                      }}
                      onKeyDown={tradeKeyDown(pane.side)}
                    />
                  </div>
                  <div className="rapid-hint">
                    {paneError ? (
                      <span className="warn">{paneError}</span>
                    ) : paneEntries.length > 0 ? (
                      <>
                        <kbd>Backspace</kbd> undoes the last entry
                      </>
                    ) : (
                      <>
                        Type a card id and press <kbd>Enter</kbd>
                      </>
                    )}
                  </div>

                  <div className="rapid-list">
                    {paneEntries.length === 0 && (
                      <div className="rapid-empty">{pane.empty}</div>
                    )}
                    {paneEntries.map((e) => {
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
              );
            })}
          </div>

          <div className="modal-actions rapid-actions">
            <div className="rapid-stats">
              <div className="stat-box">
                <div className="v">{money(-awayValue)}</div>
                <div className="k">Giving</div>
              </div>
              <div className="stat-box">
                <div className="v">{money(returnValue)}</div>
                <div className="k">Getting</div>
              </div>
              <div className="stat-box">
                <div className={`v ${returnValue + awayValue < 0 ? 'neg' : ''}`}>
                  {money(returnValue + awayValue)}
                </div>
                <div className="k">Net value</div>
              </div>
            </div>
            <span className="spacer" />
            <button className="primary" onClick={commitTrade} disabled={tradeDirty === 0}>
              ✓ Commit trade to your collection
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
