// Rules: docs/surplus.md
import React, { useMemo, useState } from 'react';
import { useApp } from '../state.jsx';
import {
  cardIdentity,
  dedupeByIdentity,
  isToken,
  money,
  ownedCopies,
  setLabel,
} from '../lib/cards.js';
import { deckCopyLimit } from '../lib/deck.js';
import { csvCell, downloadText } from '../lib/download.js';
import { KEEP_TAG, hasTag } from '../lib/tags.js';

const TYPE_FILTERS = [
  { id: 'any', label: 'All types' },
  { id: 'main', label: 'Main-deck cards (limit 3)' },
  { id: 'Rune', label: 'Runes (limit 12)' },
  { id: 'Battlefield', label: 'Battlefields (limit 1)' },
  { id: 'Legend', label: 'Legends (limit 1)' },
];

// The copies you would trade away are the ones you keep last, so surplus is
// valued from the cheapest end of the stack rather than at a single list price.
// Groups are tiny (rarely more than a dozen copies), so expanding them per copy
// is cheaper than reasoning about it.
function splitSurplus(printings, limit) {
  const units = [];
  for (const p of printings) {
    for (let i = 0; i < p.normal; i += 1) units.push({ price: p.card.price || 0, card: p.card, foil: false });
    for (let i = 0; i < p.foil; i += 1) units.push({ price: p.card.foilPrice || 0, card: p.card, foil: true });
  }
  units.sort((a, b) => b.price - a.price);
  const surplus = units.slice(limit);
  return { surplus, value: surplus.reduce((s, u) => s + u.price, 0) };
}

export default function SurplusPage() {
  const { cards, cardsById, collection, tags } = useApp();

  const [typeFilter, setTypeFilter] = useState('any');
  const [excludeKeep, setExcludeKeep] = useState(true);
  const [minValue, setMinValue] = useState('0');
  const [sort, setSort] = useState('value');

  // Built from the collection rather than the 1383-row card list: surplus only
  // exists for cards you own.
  const report = useMemo(() => {
    const groups = new Map();
    let unresolved = 0;

    for (const [cardId, entry] of Object.entries(collection)) {
      const card = cardsById.get(cardId);
      if (!card) {
        unresolved += 1;
        continue;
      }
      const { normal, foil, total } = ownedCopies(entry);
      if (total === 0) continue;
      const key = cardIdentity(card);
      const group = groups.get(key) || { printings: [], normal: 0, foil: 0 };
      group.printings.push({ card, normal, foil });
      group.normal += normal;
      group.foil += foil;
      groups.set(key, group);
    }

    const rows = [];
    let tokens = 0;

    for (const group of groups.values()) {
      // Alt-art and promo copies fold into the base card a deck would list, so
      // the row shows the earliest printing — the same rule the deck importer
      // uses to pick a canonical card.
      const display = dedupeByIdentity(group.printings.map((p) => p.card))[0];
      if (isToken(display)) {
        tokens += 1;
        continue;
      }
      const total = group.normal + group.foil;
      const limit = deckCopyLimit(display);
      if (total <= limit) continue;

      const { surplus, value } = splitSurplus(group.printings, limit);
      rows.push({
        display,
        printings: group.printings.sort((a, b) => a.card.id.localeCompare(b.card.id)),
        normal: group.normal,
        foil: group.foil,
        total,
        limit,
        surplus: surplus.length,
        surplusFoil: surplus.filter((u) => u.foil).length,
        value,
        // Tags key on the printing id, so any tagged printing protects the card.
        keep: group.printings.some((p) => hasTag(tags, p.card.id, KEEP_TAG)),
      });
    }

    return { rows, tokens, unresolved, keepTagged: rows.filter((r) => r.keep).length };
  }, [collection, cardsById, tags]);

  const visible = useMemo(() => {
    const floor = Number(minValue) || 0;
    const list = report.rows.filter((r) => {
      if (excludeKeep && r.keep) return false;
      if (r.value < floor) return false;
      if (typeFilter === 'any') return true;
      if (typeFilter === 'main') {
        return !['Rune', 'Battlefield', 'Legend'].includes(r.display.type);
      }
      return r.display.type === typeFilter;
    });
    if (sort === 'value') list.sort((a, b) => b.value - a.value || b.surplus - a.surplus);
    else if (sort === 'copies') list.sort((a, b) => b.surplus - a.surplus || b.value - a.value);
    else list.sort((a, b) => a.display.name.localeCompare(b.display.name));
    return list;
  }, [report, typeFilter, minValue, sort, excludeKeep]);

  const summary = useMemo(
    () => ({
      cards: visible.length,
      copies: visible.reduce((s, r) => s + r.surplus, 0),
      value: visible.reduce((s, r) => s + r.value, 0),
    }),
    [visible]
  );

  const exportCsv = () => {
    const lines = ['CardId,Name,Set,Type,OwnedNormal,OwnedFoil,Limit,SurplusCopies,SurplusValue,Printings'];
    for (const r of visible) {
      const printings = r.printings
        .map((p) => `${p.card.id} x${p.normal + p.foil}${p.foil ? ` (${p.foil} foil)` : ''}`)
        .join(' | ');
      lines.push(
        [
          r.display.id,
          csvCell(r.display.name),
          r.display.setCode,
          r.display.type,
          r.normal,
          r.foil,
          r.limit,
          r.surplus,
          r.value.toFixed(2),
          csvCell(printings),
        ].join(',')
      );
    }
    downloadText('riftbound-surplus.csv', lines.join('\n'));
  };

  return (
    <div>
      <h1 className="page-title">Surplus</h1>
      <p className="page-sub">
        Cards you own more of than one deck could ever play. Limits are 3 copies for main-deck
        cards, 12 for Runes, and 1 each for Battlefields and Legends; tokens have no limit and are
        excluded. Copies are counted across every printing — an alt-art copy counts toward the base
        card — and foils count the same as normals. Surplus value assumes you keep the most valuable
        copies.
      </p>

      <div className="toolbar">
        <span className="count-note">{visible.length} cards with surplus</span>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {TYPE_FILTERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="inline">
          <input
            type="checkbox"
            checked={excludeKeep}
            onChange={(e) => setExcludeKeep(e.target.checked)}
          />
          {/* label.inline is a flex row with its own gap — a literal space here
              would add a second one and push the text off the checkbox. */}
          <span>Hide Keeps</span>
        </label>
        <label className="inline">
          Min value $
          <input
            type="number"
            step="0.25"
            min="0"
            style={{ width: 70 }}
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
          />
        </label>
        <span className="spacer" />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="value">Sort: Surplus value</option>
          <option value="copies">Sort: Surplus copies</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <div className="summary-cards">
        <div className="stat-box">
          <div className="v">{summary.cards}</div>
          <div className="k">Cards with surplus</div>
        </div>
        <div className="stat-box">
          <div className="v">{summary.copies}</div>
          <div className="k">Surplus copies</div>
        </div>
        <div className="stat-box">
          <div className="v">{money(summary.value)}</div>
          <div className="k">Surplus value</div>
        </div>
      </div>

      <div className="section-head">
        <h3>Surplus ({visible.length})</h3>
        <button onClick={exportCsv} disabled={visible.length === 0}>
          Export CSV
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          Nothing over its limit yet. Cards show up here once you own a fourth copy of a main-deck
          card, a thirteenth rune, or a second battlefield or legend.
        </p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Card</th>
              <th>Set</th>
              <th>Type</th>
              <th className="num qty-col">Owned</th>
              <th className="num">Limit</th>
              <th className="num qty-col">Surplus</th>
              <th className="num">Value</th>
              <th>Printings</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.display.id}>
                <td>{r.display.name}</td>
                <td>
                  <span className="muted">{setLabel(r.display)}</span> {r.display.id}
                </td>
                <td>{r.display.type || '—'}</td>
                <td className="num">
                  <span className="qty">
                    <span className="qty-n">{r.total}</span>
                    <span className="qty-note">{r.foil > 0 ? `${r.foil} foil` : ''}</span>
                  </span>
                </td>
                <td className="num">{r.limit}</td>
                <td className="num">
                  <span className="qty">
                    <span className="qty-n accent">{r.surplus}</span>
                    <span className="qty-note">
                      {r.surplusFoil > 0 ? `${r.surplusFoil} foil` : ''}
                    </span>
                  </span>
                </td>
                <td className="num">{money(r.value)}</td>
                <td>
                  <span className="muted">
                    {r.printings
                      .map((p) => `${p.card.id} ×${p.normal + p.foil}${p.foil ? ` (${p.foil}F)` : ''}`)
                      .join(' · ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: 12 }}>
        {report.tokens > 0 && <>{report.tokens} owned tokens excluded (no deck limit). </>}
        {excludeKeep && report.keepTagged > 0 && (
          <>
            {report.keepTagged} cards over their limit are hidden because a printing is tagged{' '}
            {KEEP_TAG}.{' '}
          </>
        )}
        {report.unresolved > 0 && (
          <>{report.unresolved} collection entries reference ids not in the card database. </>
        )}
        {cards.length === 0 && <>Card database is empty — press “Update prices” on Collection.</>}
      </p>
    </div>
  );
}
