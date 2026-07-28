import * as cheerio from 'cheerio';
import { readJson, writeJson } from './store.js';

const BASE = 'https://riftdecks.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`riftdecks.com returned ${res.status} for ${url}`);
  return res.text();
}

// Legends list with the metashare values as displayed (rounded) on the site.
export async function getLegends(metagameId, { refresh = false } = {}) {
  const cacheFile = `meta-cache/legends-${metagameId}.json`;
  if (!refresh) {
    const cached = await readJson(cacheFile);
    if (cached) return cached;
  }

  const html = await fetchHtml(`${BASE}/legends?metagame_id=${encodeURIComponent(metagameId)}`);
  const $ = cheerio.load(html);
  const legends = [];
  $('tr[data-href*="/legends/"]').each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.attr('data-href') || '';
    const slugMatch = href.match(/\/legends\/(?:constructed\/)?([^/?#]+)/);
    if (!slugMatch) return;
    const name = $tr.find('a strong').first().text().trim();
    const share = parseFloat($tr.find('[data-metashare]').attr('data-metashare'));
    const win = parseFloat($tr.find('[data-winrate]').attr('data-winrate'));
    const decks = parseInt($tr.find('[data-totaldecks]').attr('data-totaldecks'), 10);
    legends.push({
      name,
      slug: slugMatch[1],
      href,
      sharePct: Number.isFinite(share) ? share : 0,
      winPct: Number.isFinite(win) ? win : null,
      decks: Number.isFinite(decks) ? decks : null,
    });
  });

  if (legends.length === 0) {
    throw new Error(
      `No legends found for metagame_id=${metagameId} — the page may have changed or the id is invalid`
    );
  }

  const payload = { fetchedAt: new Date().toISOString(), metagameId: String(metagameId), legends };
  await writeJson(cacheFile, payload);
  return payload;
}

function cardIdFromImg(img) {
  // "/img/cards/riftbound//OGN/ogn-039a-298_cropped.png" -> "OGN-039a"
  const m = String(img).match(/\/([a-z]{2,4})-(\d+[a-z]?)-\d+[a-z]?_/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

// Per-legend card usage, parsed from the embedded DATA array on the meta-map page.
export async function getMetaMap(metagameId, slug, { refresh = false } = {}) {
  const safeSlug = String(slug).replace(/[^a-z0-9-]/gi, '');
  const cacheFile = `meta-cache/metamap-${metagameId}-${safeSlug}.json`;
  if (!refresh) {
    const cached = await readJson(cacheFile);
    if (cached) return cached;
  }

  const url = `${BASE}/legends/${safeSlug}/meta-map?metagame_id=${encodeURIComponent(
    metagameId
  )}&date_range=all&relevance=3`;
  const html = await fetchHtml(url);
  const m = html.match(/var\s+DATA\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) throw new Error(`Could not find card data on meta-map page for ${safeSlug}`);

  const cards = JSON.parse(m[1]).map((c) => ({
    name: c.name,
    slug: c.slug,
    cardId: cardIdFromImg(c.img),
    set: c.set || null,
    domain: c.domain || null,
    type: c.type || null,
    decks: c.decks ?? null,
    copies: c.copies ?? null,
    playRate: c.play ?? null,
    winRate: c.win ?? null,
  }));

  const payload = {
    fetchedAt: new Date().toISOString(),
    metagameId: String(metagameId),
    slug: safeSlug,
    url,
    cards,
  };
  await writeJson(cacheFile, payload);
  return payload;
}
