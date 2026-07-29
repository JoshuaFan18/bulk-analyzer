import React from 'react';
import DomainIcon from './DomainIcon.jsx';
import { COLOR_HEX } from '../lib/cards.js';
import { DOMAIN_ICON } from '../lib/icons.js';

// A row of toggleable domain filter chips, shared by the collection page and the
// True Bulk analyzer.
//
// Colorless has no art of its own and must NOT borrow the rainbow rune, which
// reads as "any domain" -- the opposite of no domain. It renders as a bare
// coloured circle instead, with the name carried by the title.
//
// `options` is a list of { domain, count }. The count is optional and only
// reaches the tooltip, because the two pages disagree on whether one is
// meaningful.
export default function DomainChips({ options, selected, onToggle }) {
  if (options.length === 0) return null;
  return (
    <div className="color-chips">
      {options.map(({ domain, count }) => (
        <button
          key={domain}
          className={`color-chip ${selected.includes(domain) ? 'on' : ''}`}
          style={DOMAIN_ICON[domain] ? undefined : { background: COLOR_HEX[domain] }}
          title={count == null ? domain : `${domain} (${count})`}
          onClick={() => onToggle(domain)}
        >
          {DOMAIN_ICON[domain] ? <DomainIcon domain={domain} variant="plain" /> : null}
        </button>
      ))}
    </div>
  );
}
