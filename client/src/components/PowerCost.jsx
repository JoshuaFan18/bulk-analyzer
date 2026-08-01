// Rules: docs/components.md
import React from 'react';
import DomainIcon from './DomainIcon.jsx';

// A card's POWER (colored) cost, drawn as one domain symbol per point. Distinct
// from card.cost, which is the generic ENERGY cost the DotGG feed carries.
//
// Icon choice: a card with a single non-Colorless domain draws that domain's
// symbol (Rebuke OGN-172, power 2, Chaos -> two Chaos2.png). Multi-domain and
// generic (colorless) both draw the rainbow rune. In the current card data only
// the 57 multi-domain cards ever reach that branch -- no colorless card carries
// a power value -- but the fallback is written for the day one does.
//
// Renders nothing when power is 0 (542 cards) or null (311: legends,
// battlefields, runes, tokens), so an empty slot beside the energy cost is
// correct rather than a missing value.
export default function PowerCost({ card, className }) {
  const power = card?.power;
  if (power == null || power <= 0) return null;

  const domains = (card.colors || []).filter((c) => c && c !== 'Colorless');
  const domain = domains.length === 1 ? domains[0] : 'Rainbow';
  const label = `${power} ${domains.length === 1 ? domain : 'any-domain'} power`;

  return (
    <span className={className ? `power-cost ${className}` : 'power-cost'} title={label}>
      {Array.from({ length: power }, (_, i) => (
        <DomainIcon key={i} domain={domain} variant="power" title={label} />
      ))}
    </span>
  );
}
