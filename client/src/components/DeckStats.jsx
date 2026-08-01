// Rules: docs/components.md
import React, { useMemo } from 'react';
import { useApp } from '../state.jsx';
import { COLOR_HEX, ENERGY_BUCKETS, energyBucket, money } from '../lib/cards.js';
import { deckPrice, zoneCount } from '../lib/deck.js';

// Small single-hue stat charts. Identity is carried by text labels,
// never by color alone.
export default function DeckStats({ deck }) {
  const { cardsById } = useApp();

  const stats = useMemo(() => {
    const curve = new Map();
    const types = new Map();
    const domains = new Map();
    let mainCount = 0;
    // The Chosen Champion is one of the 40, so it belongs in these totals even
    // though it lives in its own field.
    const entries = Object.entries(deck.main || {});
    if (deck.champion) entries.push([deck.champion, 1]);
    for (const [cardId, count] of entries) {
      const card = cardsById.get(cardId);
      if (!card) continue;
      mainCount += count;
      const bucket = energyBucket(card) ?? '—';
      curve.set(bucket, (curve.get(bucket) || 0) + count);
      types.set(card.type || '—', (types.get(card.type || '—') || 0) + count);
      for (const d of card.colors || []) domains.set(d, (domains.get(d) || 0) + count);
    }
    const buckets = ENERGY_BUCKETS.map((b) => ({ label: b, value: curve.get(b) || 0 }));
    const maxCurve = Math.max(1, ...buckets.map((b) => b.value));
    return {
      buckets,
      maxCurve,
      mainCount,
      types: [...types.entries()].sort((a, b) => b[1] - a[1]),
      domains: [...domains.entries()].sort((a, b) => b[1] - a[1]),
      price: deckPrice(deck, cardsById),
      runes: zoneCount(deck.runes),
      battlefields: zoneCount(deck.battlefields),
    };
  }, [deck, cardsById]);

  const maxDomain = Math.max(1, ...stats.domains.map(([, v]) => v));
  const maxType = Math.max(1, ...stats.types.map(([, v]) => v));

  return (
    <div>
      <div className="chart-block">
        <h4>Energy curve (main deck + champion, {stats.mainCount} cards)</h4>
        <div className="curve">
          {stats.buckets.map((b) => (
            <div className="col" key={b.label}>
              <span className="val">{b.value > 0 ? b.value : ''}</span>
              <div
                className="bar-v"
                style={{ height: `${(b.value / stats.maxCurve) * 70}px` }}
              />
              <span className="lbl">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-block">
        <h4>Domains</h4>
        {stats.domains.length === 0 && <div className="muted">No cards yet</div>}
        {stats.domains.map(([domain, value]) => (
          <div className="progress-row" key={domain}>
            <div className="pr-head">
              <span>{domain}</span>
              <span className="pct">{value}</span>
            </div>
            <div className="bar">
              <div
                style={{
                  width: `${(value / maxDomain) * 100}%`,
                  background: COLOR_HEX[domain] || 'var(--accent-2)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="chart-block">
        <h4>Card types (main deck)</h4>
        {stats.types.length === 0 && <div className="muted">No cards yet</div>}
        {stats.types.map(([type, value]) => (
          <div className="progress-row" key={type}>
            <div className="pr-head">
              <span>{type}</span>
              <span className="pct">{value}</span>
            </div>
            <div className="bar">
              <div style={{ width: `${(value / maxType) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="chart-block">
        <h4>Estimated price</h4>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
          {money(stats.price)}
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          Cheapest printing per card, bench excluded
        </div>
      </div>
    </div>
  );
}
