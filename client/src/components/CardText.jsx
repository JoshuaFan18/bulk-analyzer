// Rules: docs/components.md
import React from 'react';
import DomainIcon from './DomainIcon.jsx';
import { TAP_ICON } from '../lib/icons.js';
import { iconSpec, parseCardText } from '../lib/cardText.js';

// The game's inline symbols. Runes and the exhaust glyph are the bundled art in
// client/src/assets/icons/; might and energy stay CSS-drawn, since the icon
// rules do not name a file for either.
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
    return <img className="rb-icon exhaust" src={TAP_ICON} alt={spec.label} title={spec.label} />;
  // spec.value is a domain name, or "Rainbow" for [rb_rune_rainbow]; DomainIcon
  // maps anything without art of its own onto the rainbow rune.
  return <DomainIcon className="rb-icon rune-art" domain={spec.value} title={spec.label} />;
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
