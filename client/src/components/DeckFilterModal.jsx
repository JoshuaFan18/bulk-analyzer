import React from 'react';
import Modal from './Modal.jsx';
import DomainIcon from './DomainIcon.jsx';
import { MIGHT_BUCKETS, POWER_BUCKETS, RARITIES, SUPERTYPES } from '../lib/cards.js';

// The pool's energy buckets. Exported because DeckBuilderPage has to bucket
// cards under exactly these values to count them, and two lists that drifted
// would put a count next to an option that filters to something else.
export const ENERGY_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

// Card TYPE, which is not the pool tab strip above the grid. That strip is
// zone-oriented (Legends, Champion, Battlefields, Runes) and decides which zone
// a click adds to; this splits what a Main Deck can hold. The two compose.
export const TYPE_FILTERS = ['Gear', 'Spell', 'Unit'];

// Showcase printings never reach the pool (isBasePrinting drops them), so the
// option would sit at a permanent 0.
export const RARITY_FILTERS = RARITIES.filter((r) => r !== 'Showcase');

// Controls that only exist in the with-a-legend layout. Their values survive
// the legend being cleared, so the modal says so rather than filtering the pool
// from a control that is no longer on screen.
const LEGEND_ONLY_KEYS = ['type', 'cost', 'power', 'might', 'rarity'];

function Pill({ on, count, onClick, title, children }) {
  return (
    <button type="button" className={`fm-opt ${on ? 'on' : ''}`} onClick={onClick} title={title}>
      <span className="fm-opt-label">{children}</span>
      <span className="fm-opt-count">{count || 0}</span>
    </button>
  );
}

function Row({ label, children }) {
  return (
    <div className="fm-row">
      <div className="fm-row-label">{label}</div>
      <div className="fm-opts">{children}</div>
    </div>
  );
}

function Section({ tone, title, children }) {
  return (
    <section className={`fm-section ${tone}`}>
      <div className="fm-section-head">
        <span className="fm-dot" />
        {title}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, count, on, onChange }) {
  return (
    <label className={`fm-toggle ${on ? 'on' : ''}`}>
      <span className="fm-toggle-label">{label}</span>
      <span className="fm-opt-count">{count || 0}</span>
      <input
        type="checkbox"
        className="fm-switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

// The deck builder's filters as a dialog, replacing the wall of selects that
// used to sit above the pool. Every option carries a live match count computed
// by the page (poolCounts): the count is what picking that option would leave,
// with every OTHER filter still applied.
export default function DeckFilterModal({
  filters,
  onChange,
  onReset,
  onClose,
  counts,
  domains,
  hasLegend,
  setNames,
  keywordOptions,
  customTags,
  apiTags,
}) {
  // Single-select pills: clicking the active one clears it back to "any".
  const pick = (key, value) => onChange({ [key]: filters[key] === value ? 'any' : value });

  const toggleDomain = (domain) =>
    onChange({
      colors: filters.colors.includes(domain)
        ? filters.colors.filter((c) => c !== domain)
        : [...filters.colors, domain],
    });

  const stranded = hasLegend ? [] : LEGEND_ONLY_KEYS.filter((k) => filters[k] !== 'any');

  return (
    <Modal title="Filter cards" className="filter-modal" onClose={onClose}>
      <button className="fm-close" onClick={onClose} title="Close">
        ✕
      </button>

      <div className="fm-grid">
        <Section tone="primary" title="Primary">
          {/* With a legend chosen the pool is already limited to its two
              domains, so those are the only two worth offering. */}
          <Row label="Domain">
            {domains.map((domain) => (
              <Pill
                key={domain}
                on={filters.colors.includes(domain)}
                count={counts.colors?.[domain]}
                onClick={() => toggleDomain(domain)}
                title={domain}
              >
                <DomainIcon domain={domain} variant="power" />
              </Pill>
            ))}
          </Row>

          {/* No legend collapses PRIMARY to the domain row. */}
          {hasLegend && (
            <Row label="Type">
              {TYPE_FILTERS.map((t) => (
                <Pill
                  key={t}
                  on={filters.type === t}
                  count={counts.type?.[t]}
                  onClick={() => pick('type', t)}
                >
                  {t}
                </Pill>
              ))}
            </Row>
          )}

          {hasLegend && (
            <Row label="Energy">
              {ENERGY_BUCKETS.map((e) => (
                <Pill
                  key={e}
                  on={filters.cost === e}
                  count={counts.cost?.[e]}
                  onClick={() => pick('cost', e)}
                >
                  {e}
                </Pill>
              ))}
            </Row>
          )}
        </Section>

        {hasLegend && (
          <Section tone="properties" title="Card properties">
            <Row label="Power">
              {POWER_BUCKETS.map((p) => (
                <Pill
                  key={p}
                  on={filters.power === p}
                  count={counts.power?.[p]}
                  onClick={() => pick('power', p)}
                >
                  {p}
                </Pill>
              ))}
            </Row>
            <Row label="Might">
              {MIGHT_BUCKETS.map((m) => (
                <Pill
                  key={m}
                  on={filters.might === m}
                  count={counts.might?.[m]}
                  onClick={() => pick('might', m)}
                >
                  {m}
                </Pill>
              ))}
            </Row>
            <Row label="Rarity">
              {RARITY_FILTERS.map((r) => (
                <Pill
                  key={r}
                  on={filters.rarity === r}
                  count={counts.rarity?.[r]}
                  onClick={() => pick('rarity', r)}
                >
                  {r}
                </Pill>
              ))}
            </Row>
          </Section>
        )}
      </div>

      {stranded.length > 0 && (
        <div className="fm-stranded">
          <span>Still filtering on {stranded.join(', ')} — pick a legend to see those controls.</span>
          <button
            onClick={() => onChange(Object.fromEntries(LEGEND_ONLY_KEYS.map((k) => [k, 'any'])))}
          >
            Clear them
          </button>
        </div>
      )}

      <Section tone="advanced" title="Advanced">
        <Row label="Set">
          {setNames.map(([code, name]) => (
            <Pill
              key={code}
              on={filters.set === code}
              count={counts.set?.[code]}
              onClick={() => pick('set', code)}
              title={code}
            >
              {name}
            </Pill>
          ))}
        </Row>

        <div className="fm-fields">
          <label>
            <span className="fm-field-label">Keywords</span>
            <select value={filters.keyword} onChange={(e) => onChange({ keyword: e.target.value })}>
              <option value="any">Any keywords</option>
              {keywordOptions.map(([kw, n]) => (
                <option key={kw} value={kw}>
                  {kw} ({n})
                </option>
              ))}
            </select>
          </label>

          {/* Same three-kind encoding the collection page's tag filter uses. */}
          <label>
            <span className="fm-field-label">Tags</span>
            <select value={filters.tag} onChange={(e) => onChange({ tag: e.target.value })}>
              <option value="any">Any tags</option>
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
          </label>

          <label>
            <span className="fm-field-label">Super type</span>
            <select
              value={filters.supertype}
              onChange={(e) => onChange({ supertype: e.target.value })}
            >
              <option value="any">Any super type</option>
              {SUPERTYPES.filter((s) => s !== 'Token').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="fm-field-label">Errata</span>
            <select value={filters.errata} onChange={(e) => onChange({ errata: e.target.value })}>
              <option value="any">Any errata</option>
              <option value="yes">Has errata</option>
              <option value="no">No errata</option>
            </select>
          </label>
        </div>
      </Section>

      <Section tone="status" title="Status">
        <div className="fm-status">
          <div>
            <div className="fm-status-head">Legality</div>
            <Toggle
              label="Legal only"
              count={counts.legality?.legal}
              on={filters.legality === 'legal'}
              onChange={(v) => onChange({ legality: v ? 'legal' : 'any' })}
            />
            {/* The mockup shows one toggle here. Banned-only was in the select
                this modal replaced and is the only way to see the 13 banned
                cards, so it stays rather than being dropped silently. */}
            <Toggle
              label="Banned only"
              count={counts.legality?.banned}
              on={filters.legality === 'banned'}
              onChange={(v) => onChange({ legality: v ? 'banned' : 'any' })}
            />
          </div>
          <div>
            <div className="fm-status-head">Availability</div>
            <Toggle
              label="Available to add"
              count={counts.available?.on}
              on={filters.availableOnly}
              onChange={(v) => onChange({ availableOnly: v })}
            />
          </div>
          <div>
            {/* Where BOOKMARKS sits in the mockup. Bookmarks are deliberately
                not being built, so the slot carries the owned-only toggle. */}
            <div className="fm-status-head">Collection</div>
            <Toggle
              label="Owned only"
              count={counts.owned?.on}
              on={filters.ownedOnly}
              onChange={(v) => onChange({ ownedOnly: v })}
            />
          </div>
        </div>
      </Section>

      <div className="modal-actions">
        <button onClick={onReset}>Reset filters</button>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
