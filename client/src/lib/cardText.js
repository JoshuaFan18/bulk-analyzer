// Rules text as the DotGG API stores it: light HTML (<br />, <ul>/<li>, <em>)
// with two kinds of inline token — `:rb_might:` style icon codes and the
// `[Reaction]` / `[Shield 2]` keyword brackets that lib/cards.js already mines
// for the keyword filter. This turns one effect string into plain data so the
// renderer stays in a component; nothing here returns markup.

// Every icon code in the current card pool: rb_might, rb_exhaust,
// rb_energy_<n> (0-12) and rb_rune_<domain>, plus rb_rune_rainbow for "a rune
// of any domain".
export function iconSpec(token) {
  if (token === 'rb_might') return { kind: 'might', label: 'Might' };
  if (token === 'rb_exhaust') return { kind: 'exhaust', label: 'Exhaust' };
  const energy = /^rb_energy_(\d+)$/.exec(token);
  if (energy) return { kind: 'energy', value: energy[1], label: `${energy[1]} energy` };
  const rune = /^rb_rune_([a-z]+)$/.exec(token);
  if (rune) {
    const name = rune[1][0].toUpperCase() + rune[1].slice(1);
    return { kind: 'rune', value: name, label: name === 'Rainbow' ? 'Rune (any)' : `${name} rune` };
  }
  return null;
}

// <em>…</em> | :icon: | [>] | [Keyword] / [Keyword 2]. The bracketed arrow
// (stored escaped, as `[&gt;]`) separates a condition from what it grants
// ("[Empowered][>] I have +1 might") and is the only bracket token that is not
// a keyword.
const INLINE =
  /<em>([\s\S]*?)<\/em>|:([a-z0-9_]+):|\[((?:&gt;|>){1,2})\]|\[([A-Z][A-Za-z' -]*?)(?: (\d+))?\]/g;

// Any tag the block splitter did not consume. Card text is authored by hand, so
// a stray <i> or <b> should degrade to plain text rather than show as markup.
const LEFTOVER_TAG = /<[^>]*>/g;

const ENTITIES = { '&gt;': '>', '&lt;': '<', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

// Entities are decoded after the tags are gone, so a decoded < never looks like
// the start of one.
export function decodeEntities(value) {
  return String(value || '').replace(/&(?:gt|lt|amp|quot|#39);/g, (e) => ENTITIES[e] || e);
}

function text(value) {
  const cleaned = decodeEntities(value.replace(LEFTOVER_TAG, ''));
  return cleaned ? [{ t: 'text', v: cleaned }] : [];
}

function parseParts(line) {
  const parts = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    parts.push(...text(line.slice(last, m.index)));
    last = m.index + m[0].length;
    // Reminder text is italicised as a whole but still carries icon codes
    // inside it, so an <em> holds parsed parts rather than a flat string.
    if (m[1] !== undefined) parts.push({ t: 'em', parts: parseParts(m[1]) });
    else if (m[2] !== undefined) parts.push({ t: 'icon', v: m[2] });
    else if (m[3] !== undefined) parts.push({ t: 'arrow', n: decodeEntities(m[3]).length });
    // [NO TEXT] is a placeholder, not a keyword — the same exclusion
    // buildKeywordIndex makes. It only ever appears alone, so dropping it
    // leaves an empty block that parseCardText discards.
    else if (m[4] !== 'NO TEXT') parts.push({ t: 'keyword', v: m[4], n: m[5] || null });
  }
  parts.push(...text(line.slice(last)));
  return parts;
}

// Marks a <li> while the text is still one flat string, so the line split can
// tell a bullet from an ordinary line. A control character, because no card
// text contains one.
const BULLET = '\u0001';

// Blocks of `{ bullet, parts }`, one per rendered line. Empty when the card has
// no rules text at all, which every caller treats as "nothing to show".
export function parseCardText(effect) {
  const raw = String(effect || '').trim();
  if (!raw) return [];
  const lines = raw
    .replace(/<\/?ul>/gi, '\n')
    .replace(/<li>/gi, `\n${BULLET}`)
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .split('\n');

  const blocks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.startsWith(BULLET);
    const parts = parseParts(bullet ? trimmed.slice(1) : trimmed);
    if (parts.length > 0) blocks.push({ bullet, parts });
  }
  return blocks;
}
