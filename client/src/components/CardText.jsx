import React from 'react';
import { COLOR_HEX } from '../lib/cards.js';
import { iconSpec, parseCardText } from '../lib/cardText.js';

// The game's inline symbols, drawn from CSS rather than the reference art in
// icons/ so nothing has to be bundled or hot-linked.
export function CardIcon({ token }) {
  const spec = iconSpec(token);
  // An icon code the card pool has not used before shows as its literal token
  // rather than vanishing, so a new symbol is visible instead of silently lost.
  if (!spec) return <span className="rb-icon unknown">:{token}:</span>;
  if (spec.kind === 'energy')
    return (
      <span className="rb-icon energy" title={spec.label}>
        {spec.value}
      </span>
    );
  if (spec.kind === 'might')
    return (
      <span className="rb-icon might" title={spec.label}>
        ⚔
      </span>
    );
  if (spec.kind === 'exhaust')
    return (
      <span className="rb-icon exhaust" title={spec.label}>
        ⟳
      </span>
    );
  const hex = COLOR_HEX[spec.value];
  return (
    <span
      className={`rb-icon rune ${hex ? '' : 'rainbow'}`}
      style={hex ? { background: hex } : undefined}
      title={spec.label}
    />
  );
}

function Parts({ parts }) {
  return parts.map((p, i) => {
    if (p.t === 'text') return <React.Fragment key={i}>{p.v}</React.Fragment>;
    if (p.t === 'em')
      return (
        <em key={i} className="rules-reminder">
          <Parts parts={p.parts} />
        </em>
      );
    if (p.t === 'icon') return <CardIcon key={i} token={p.v} />;
    if (p.t === 'arrow')
      return (
        <span key={i} className="rules-arrow">
          {p.n === 2 ? '»' : '▸'}
        </span>
      );
    return (
      <span key={i} className="kw-badge">
        {p.n ? `${p.v} ${p.n}` : p.v}
      </span>
    );
  });
}

// Rules text with its keywords as badges and its icon codes as symbols. Renders
// nothing at all when the card has no rules text — the caller decides whether
// that deserves an empty state.
export default function CardText({ effect, className }) {
  const blocks = parseCardText(effect);
  if (blocks.length === 0) return null;
  return (
    <div className={className ? `rules-text ${className}` : 'rules-text'}>
      {blocks.map((b, i) => (
        <div key={i} className={b.bullet ? 'rules-line bullet' : 'rules-line'}>
          <Parts parts={b.parts} />
        </div>
      ))}
    </div>
  );
}
