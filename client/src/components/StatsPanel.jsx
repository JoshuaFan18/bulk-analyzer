// Rules: docs/components.md
import React, { useMemo } from 'react';
import { COLORS, isToken, money, ownedCopies, playsetTarget, setLabel } from '../lib/cards.js';

function ProgressRow({ label, have, total }) {
  const pct = total > 0 ? (have / total) * 100 : 0;
  return (
    <div className="progress-row">
      <div className="pr-head">
        <span>{label}</span>
        <span className="pct">
          {have} / {total} · {pct.toFixed(1)}%
        </span>
      </div>
      <div className="bar">
        <div style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export default function StatsPanel({ cards, collection }) {
  const stats = useMemo(() => {
    let value = 0;
    let totalCopies = 0;
    let unique = 0;
    let playsetHave = 0;
    let playsetTotal = 0;
    const bySet = new Map();
    const byRarity = new Map();
    const byColor = new Map();
    let normalHave = 0;
    let normalTotal = 0;
    let foilHave = 0;
    let foilTotal = 0;
    let promoHave = 0;
    let promoTotal = 0;
    let runeHave = 0;
    let runeTotal = 0;

    const bump = (map, key, owned) => {
      if (!map.has(key)) map.set(key, { have: 0, total: 0 });
      const e = map.get(key);
      e.total += 1;
      if (owned) e.have += 1;
    };

    // Keyed by set code, not by the label: a set whose cards disagree on
    // set_name must still be one row.
    const bumpSet = (card, owned) => {
      if (!bySet.has(card.setCode)) {
        bySet.set(card.setCode, { label: `${card.setCode} — ${setLabel(card)}`, have: 0, total: 0 });
      }
      const e = bySet.get(card.setCode);
      e.total += 1;
      if (owned) e.have += 1;
    };

    for (const card of cards) {
      const { normal, foil, total } = ownedCopies(collection[card.id]);
      const owned = total > 0;
      if (owned) {
        unique += 1;
        totalCopies += total;
        value += normal * (card.price || 0) + foil * (card.foilPrice || 0);
      }

      const target = playsetTarget(card);
      if (target > 0 && !isToken(card)) {
        playsetTotal += target;
        playsetHave += Math.min(total, target);
      }

      bumpSet(card, owned);
      if (card.rarity) bump(byRarity, card.rarity, owned);
      for (const color of card.colors || []) bump(byColor, color, owned);

      if (card.hasNormal) {
        normalTotal += 1;
        if (normal > 0) normalHave += 1;
      }
      if (card.hasFoil) {
        foilTotal += 1;
        if (foil > 0) foilHave += 1;
      }
      if (card.promo) {
        promoTotal += 1;
        if (owned) promoHave += 1;
      }
      if (card.type === 'Rune') {
        runeTotal += 1;
        if (owned) runeHave += 1;
      }
    }

    return {
      value,
      totalCopies,
      unique,
      playsetHave,
      playsetTotal,
      bySet: [...bySet.values()].sort((a, b) => a.label.localeCompare(b.label)),
      byRarity: [...byRarity.entries()],
      byColor: COLORS.map((c) => [c, byColor.get(c)]).filter(([, v]) => v),
      normalHave,
      normalTotal,
      foilHave,
      foilTotal,
      promoHave,
      promoTotal,
      runeHave,
      runeTotal,
    };
  }, [cards, collection]);

  return (
    <aside className="stats-panel">
      <div className="stats-big">
        <div className="stat-box">
          <div className="v">{money(stats.value)}</div>
          <div className="k">Estimate</div>
        </div>
        <div className="stat-box">
          <div className="v">{stats.totalCopies}</div>
          <div className="k">Total cards</div>
        </div>
        <div className="stat-box">
          <div className="v">{stats.unique}</div>
          <div className="k">Unique</div>
        </div>
      </div>

      <div className="stats-section">
        <h4>Full set (playsets)</h4>
        <ProgressRow label="3-set*" have={stats.playsetHave} total={stats.playsetTotal} />
        <div className="muted" style={{ fontSize: 11 }}>
          * 3 copies per card, 1 for Legends and Battlefields, Runes and Tokens excluded
        </div>
      </div>

      <div className="stats-section">
        <h4>Sets</h4>
        {stats.bySet.map((e) => (
          <ProgressRow key={e.label} label={e.label} have={e.have} total={e.total} />
        ))}
      </div>

      <div className="stats-section">
        <h4>Rarity</h4>
        {stats.byRarity.map(([label, e]) => (
          <ProgressRow key={label} label={label} have={e.have} total={e.total} />
        ))}
      </div>

      <div className="stats-section">
        <h4>Printings</h4>
        <ProgressRow label="Regular cards" have={stats.normalHave} total={stats.normalTotal} />
        <ProgressRow label="Foil cards" have={stats.foilHave} total={stats.foilTotal} />
        <ProgressRow label="Promo cards" have={stats.promoHave} total={stats.promoTotal} />
        <ProgressRow label="Runes" have={stats.runeHave} total={stats.runeTotal} />
      </div>

      <div className="stats-section">
        <h4>Elements</h4>
        {stats.byColor.map(([label, e]) => (
          <ProgressRow key={label} label={label} have={e.have} total={e.total} />
        ))}
      </div>
    </aside>
  );
}
