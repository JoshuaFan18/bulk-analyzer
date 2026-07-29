import React from 'react';

// The tag filter, shared by the collection page's filter bar and the deck
// builder's filter modal. One control offers all three kinds of tag through the
// "api:Ionia" / "custom:Keep" / "auto:wishlist" encoding matchesTagFilter reads,
// so the two screens cannot drift on what a value means.
//
// API tags are offered here but never rendered as chips on a tile -- 128 of them
// would bury the handful the user set themselves.
export default function TagFilterSelect({ value, onChange, customTags, apiTags, anyLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="any">{anyLabel}</option>
      <optgroup label="Status">
        <option value="auto:wishlist">Wishlisted</option>
        <option value="auto:indeck">In Deck</option>
        <option value="auto:untagged">No custom tags</option>
      </optgroup>
      {customTags.length > 0 && (
        <optgroup label="My tags">
          {customTags.map((t) => (
            <option key={t} value={`custom:${t}`}>
              {t}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Card tags">
        {apiTags.map((t) => (
          <option key={t} value={`api:${t}`}>
            {t}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
