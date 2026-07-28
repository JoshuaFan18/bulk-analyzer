import React from 'react';
import { DOMAIN_ICON, DOMAIN_POWER_ICON, RAINBOW_ICON } from '../lib/icons.js';

// One domain symbol. `variant="power"` is the "2"-suffixed art used for power
// costs and rules-text runes; `variant="plain"` is the flat art used by the
// Collection page's filter chips.
//
// Anything without art of its own -- "Rainbow" (a rune of any domain),
// Colorless, and an unrecognised domain from a future set -- falls back to the
// rainbow rune rather than rendering a broken image.
export default function DomainIcon({ domain, variant = 'power', className, title }) {
  const map = variant === 'plain' ? DOMAIN_ICON : DOMAIN_POWER_ICON;
  const src = map[domain] || RAINBOW_ICON;
  const label = domain === 'Rainbow' || !map[domain] ? 'Any domain' : domain;
  return (
    <img
      className={className ? `domain-icon ${className}` : 'domain-icon'}
      src={src}
      alt={label}
      title={title || label}
    />
  );
}
