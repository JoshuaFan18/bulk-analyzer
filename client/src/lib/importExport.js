import { SET_CODE_BY_NAME, normName, routeFinish } from './cards.js';
import { csvCell } from './download.js';

// Minimal CSV parser handling quoted fields with embedded commas/quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function detectFormat(text) {
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes('tcgplayer id') || head.includes('product line')) return 'tcgplayer';
  if (head.includes('cardid')) return 'dotgg';
  const firstLine = text.split(/\r?\n/).find((l) => l.trim());
  if (firstLine) {
    const parts = firstLine.split(',').map((p) => p.trim());
    if (/^[A-Za-z]{2,4}-\w+$/.test(parts[0])) return 'dotgg';
    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) return 'legacy';
  }
  return 'unknown';
}

// TCGplayer "Number" column ("023/219", "039a/298", "T03 // T04") -> collector number
function collectorFromNumber(numberField) {
  const m = String(numberField)
    .trim()
    .match(/^0*(\d+[a-z]?)\s*\//i);
  if (!m) return null;
  const numPart = m[1];
  const digits = numPart.match(/^\d+/)[0];
  const suffix = numPart.slice(digits.length);
  return digits.padStart(3, '0') + suffix;
}

// Returns { entries: {cardId: {normal, foil}}, matched, unmatched: [line...],
// converted: [{id, name, from, to, qty}] }
export function parseImport(text, cards) {
  const format = detectFormat(text);
  // One id map serves both lookups: a set code plus a collector number IS the
  // printing id, so matching "OGN" + "039a" is the same map read as matching a
  // DotGG row's CardId.
  const byId = new Map(cards.map((c) => [c.id.toUpperCase(), c]));
  const byName = new Map();
  for (const c of cards) {
    const key = normName(c.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(c);
  }

  const entries = {};
  const unmatched = [];
  const rerouted = new Map();
  let matched = 0;

  // Records the copies under the finish the printing has, and keeps a per
  // card+direction tally of every reroute so the swap is reported rather than
  // silent — the same never-drop-anything-quietly rule as `unmatched`. A row of
  // 0 copies still creates the entry (unchanged behaviour) but is not worth
  // reporting as a conversion.
  const addEntry = (card, kind, qty) => {
    const finish = routeFinish(card, kind);
    if (finish !== kind && qty > 0) {
      const key = `${card.id}|${kind}|${finish}`;
      const seen = rerouted.get(key);
      if (seen) seen.qty += qty;
      else rerouted.set(key, { id: card.id, name: card.name, from: kind, to: finish, qty });
    }
    if (!entries[card.id]) entries[card.id] = { normal: 0, foil: 0 };
    entries[card.id][finish] += qty;
  };

  if (format === 'dotgg') {
    for (const row of parseCsv(text)) {
      if (/cardid/i.test(row[0])) continue;
      const [id, normal, foil] = row;
      const card = byId.get(String(id).trim().toUpperCase());
      if (!card) {
        unmatched.push(row.join(','));
        continue;
      }
      addEntry(card, 'normal', parseInt(normal, 10) || 0);
      addEntry(card, 'foil', parseInt(foil, 10) || 0);
      matched++;
    }
  } else if (format === 'legacy') {
    for (const row of parseCsv(text)) {
      const [normal, foil, id] = row;
      const card = byId.get(String(id).trim().toUpperCase());
      if (!card) {
        unmatched.push(row.join(','));
        continue;
      }
      addEntry(card, 'normal', parseInt(normal, 10) || 0);
      addEntry(card, 'foil', parseInt(foil, 10) || 0);
      matched++;
    }
  } else if (format === 'tcgplayer') {
    const rows = parseCsv(text);
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => header.indexOf(name);
    const iSet = col('set name');
    const iName = col('product name');
    const iNumber = col('number');
    const iPrinting = col('printing');
    const iTotal = col('total quantity');
    const iAdd = col('add to quantity');
    if (iSet < 0 || iName < 0 || iPrinting < 0) {
      throw new Error('Unrecognized TCGplayer CSV header');
    }
    for (const row of rows.slice(1)) {
      const qtyRaw = [row[iTotal], row[iAdd]].find((v) => v && v.trim() !== '');
      const qty = parseInt(qtyRaw, 10) || 0;
      if (qty <= 0) continue;
      const printing = /foil/i.test(row[iPrinting] || '') ? 'foil' : 'normal';
      const setCode = SET_CODE_BY_NAME[String(row[iSet] || '').trim().toLowerCase()];
      const collector = iNumber >= 0 ? collectorFromNumber(row[iNumber]) : null;

      let card = null;
      if (setCode && collector) {
        card = byId.get(`${setCode}-${collector}`.toUpperCase()) || null;
      }
      if (!card) {
        const candidates = byName.get(normName(row[iName])) || [];
        card =
          candidates.find((c) => !setCode || c.setCode === setCode) || candidates[0] || null;
      }
      if (!card) {
        unmatched.push(`${row[iSet]} | ${row[iName]} | ${row[iNumber]} | ${row[iPrinting]} x${qty}`);
        continue;
      }
      addEntry(card, printing, qty);
      matched++;
    }
  } else {
    throw new Error('Could not detect import format (expected DotGG, Legacy, or TCGplayer CSV)');
  }

  return { format, entries, matched, unmatched, converted: [...rerouted.values()] };
}

export function exportDotGg(cards, collectionCards) {
  const lines = ['CardId,Normal,Foil,Name,Set'];
  const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (const card of sorted) {
    const entry = collectionCards[card.id];
    if (!entry || ((entry.normal || 0) === 0 && (entry.foil || 0) === 0)) continue;
    lines.push(
      `${card.id},${entry.normal || 0},${entry.foil || 0},${csvCell(card.name)},${csvCell(
        card.setName
      )}`
    );
  }
  return lines.join('\n');
}
