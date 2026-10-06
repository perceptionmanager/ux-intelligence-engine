// Weekly briefing pipeline.
// 1. Pull recent articles from the RSS/Atom feeds in feeds.json
// 2. Ask Claude to group them by a shared practical question (≥2 outlets per theme)
// 3. Ask Claude to write one briefing per theme from titles + excerpts only
// 4. Write data/briefings.json (+ a dated archive copy) with real run metadata
//
// Fails loudly (exit 1, nothing written) if too few feeds respond or no briefing
// survives validation, so the previous briefing stays live instead of a broken one.
//
// Env: ANTHROPIC_API_KEY (required unless DRY_RUN), MODEL, LOOKBACK_DAYS, DRY_RUN

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const API_KEY = process.env.ANTHROPIC_API_KEY;
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 14);
const DRY_RUN = process.env.DRY_RUN === '1';
const MIN_FEEDS_OK = 3;
const MAX_ITEMS_PER_FEED = 8;
const EXCERPT_CHARS = 600;

const ROOT = new URL('../', import.meta.url);
const CATEGORIES = {
  discovery: 'Product discovery',
  leadership: 'Design leadership',
  systems: 'Design systems',
  tooling: 'Tooling and AI',
  operations: 'Ops and strategy',
};

// ── Feed handling ───────────────────────────────────────────────

// processEntities: false avoids the parser's entity-expansion cap on large feeds; decode() handles entities instead.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false, htmlEntities: false });

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return '';
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function clean(html) {
  // Decode first so entity-escaped markup (&lt;p&gt;) is stripped too; decode twice for double-escaped feeds.
  return decode(decode(text(html)))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cleanUrl = (u) => decode(text(u)).trim();

function atomLink(link) {
  const links = asArray(link);
  const alt = links.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate'));
  if (alt) return alt['@_href'];
  return typeof links[0] === 'string' ? links[0] : links[0]?.['@_href'];
}

export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  let raw = [];
  if (doc?.rss?.channel) {
    raw = asArray(doc.rss.channel.item).map((it) => ({
      title: clean(it.title),
      url: cleanUrl(it.link),
      date: text(it.pubDate) || text(it['dc:date']),
      excerpt: clean(it.description || it['content:encoded']),
    }));
  } else if (doc?.feed) {
    raw = asArray(doc.feed.entry).map((e) => ({
      title: clean(e.title),
      url: cleanUrl(atomLink(e.link)),
      date: text(e.published) || text(e.updated),
      excerpt: clean(e.summary || e.content),
    }));
  } else if (doc?.['rdf:RDF']) {
    raw = asArray(doc['rdf:RDF'].item).map((it) => ({
      title: clean(it.title),
      url: cleanUrl(it.link),
      date: text(it['dc:date']),
      excerpt: clean(it.description),
    }));
  } else {
    throw new Error('Not an RSS or Atom document');
  }

  return raw
    .map((it) => ({ ...it, time: Date.parse(it.date), outlet: feed.name }))
    .filter((it) => it.title && /^https?:\/\//.test(it.url || '') && !Number.isNaN(it.time))
    .map((it) => ({ ...it, excerpt: it.excerpt.slice(0, EXCERPT_CHARS) }));
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'ux-briefing/1.0 (+https://perceptionmanager.com)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), feed);
}

// ── Claude ──────────────────────────────────────────────────────

export function parseJson(raw) {
  const s = raw.replace(/```json|```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in response');
  return JSON.parse(s.slice(start, end + 1));
}

async function claude(system, user, maxTokens = 2000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${data?.error?.message || 'unknown error'}`);
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseJson(out);
}

const CLUSTER_SYSTEM = `You are the editor of a weekly briefing read by senior UX and product design practitioners.
You receive recent articles (id, outlet, date, title, excerpt). Group them into themes, at most one per category:
- discovery: user research, product discovery, validation
- leadership: design leadership, team structure, influence, careers
- systems: design systems, tokens, components, consistency
- tooling: design tools, AI in the design workflow
- operations: design ops, measurement, ROI, strategy

Rules:
- A theme needs at least 2 articles from at least 2 different outlets that address the same practical question.
- Never force a theme. Omit a category if nothing qualifies.
- Prefer questions where the articles disagree or put the weight in different places.
- Use 2 to 6 articles per theme. Each article may appear in only one theme.
- Ignore event announcements, job posts, sponsor posts, and podcast episode listings with no substance.

Respond with JSON only:
{"themes":[{"category":"discovery","question":"the shared practical question, one sentence","ids":["a3","a7"]}]}`;

const SYNTH_SYSTEM = `You write one briefing for senior UX practitioners from a small set of articles.
You only see each article's title and excerpt, not the full text. Make no claim the excerpts don't support.
Write entirely in your own words: no direct quotes, no copied phrases, no statistics unless an excerpt states them.
Use plain, specific language. No hype words (revolutionary, game-changing, unlock, leverage).

Respond with JSON only:
{
  "title": "plain headline, max 9 words, sentence case",
  "dek": "one sentence: the decision practitioners are facing",
  "scenario": "two sentences: a hypothetical situation a team at a large company might face. Do not name real companies.",
  "relation": "disagree" or "emphasis",
  "positions": [
    {"label": "2-5 word name for the stance", "summary": "one or two sentences", "ids": ["a3"]},
    {"label": "...", "summary": "...", "ids": ["a7"]}
  ],
  "context": "two or three sentences of background",
  "steps": [{"label": "2-4 words", "text": "one sentence"}, {"label": "...", "text": "..."}, {"label": "...", "text": "..."}],
  "caveat": "one sentence on what these sources don't settle or don't cover"
}

Use "disagree" only when the excerpts show articles taking opposing views; otherwise use "emphasis".
Each position must cite at least one id from the provided list, and the two positions must cite different articles.
If the articles don't support a coherent briefing, respond with {"skip": true}.`;

const fmtItem = (it) => `[${it.id}] ${it.outlet} · ${new Date(it.time).toISOString().slice(0, 10)}\nTitle: ${it.title}\nExcerpt: ${it.excerpt || '(none)'}`;

// ── Validation ──────────────────────────────────────────────────

const str = (v, max = 600) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export function validateBriefing(b, theme, byId) {
  if (!b) throw new Error('empty response');
  if (b.skip) throw new Error('Claude declined: the excerpts did not support a coherent briefing');
  const allowed = new Set(theme.ids);
  const fail = (why) => { throw new Error(why); };

  for (const [k, max] of [['title', 90], ['dek', 300], ['scenario', 500], ['context', 700], ['caveat', 300]]) {
    if (!str(b[k], max)) fail(`field "${k}" missing or over ${max} chars`);
  }
  if (!['disagree', 'emphasis'].includes(b.relation)) fail(`invalid relation "${b.relation}"`);
  if (!Array.isArray(b.positions) || b.positions.length !== 2) fail('needs exactly 2 positions');
  b.positions.forEach((p, i) => {
    if (!str(p.label, 60) || !str(p.summary, 400)) fail(`position ${i + 1} label/summary missing or too long`);
    if (!Array.isArray(p.ids) || !p.ids.length) fail(`position ${i + 1} cites no articles`);
    const bad = p.ids.filter((id) => !allowed.has(id));
    if (bad.length) fail(`position ${i + 1} cites articles outside its group: ${bad.join(', ')}`);
  });
  if (!Array.isArray(b.steps) || b.steps.length < 2 || b.steps.length > 4) fail('needs 2-4 steps');
  if (!b.steps.every((s) => str(s.label, 40) && str(s.text, 300))) fail('a step label/text is missing or too long');

  const [a, c] = b.positions.map((p) => new Set(p.ids));
  if ([...a].every((id) => c.has(id)) && [...c].every((id) => a.has(id))) fail('both positions cite the same articles');

  const outletsFor = (ids) => [...new Set(ids.map((id) => byId.get(id).outlet))];
  return {
    id: `${theme.category}-${Date.now().toString(36)}`,
    category: theme.category,
    categoryLabel: CATEGORIES[theme.category],
    title: b.title.trim(),
    dek: b.dek.trim(),
    scenario: b.scenario.trim(),
    relation: b.relation,
    positions: b.positions.map((p) => ({ label: p.label.trim(), summary: p.summary.trim(), outlets: outletsFor(p.ids) })),
    context: b.context.trim(),
    steps: b.steps.map((s) => ({ label: s.label.trim(), text: s.text.trim() })),
    caveat: b.caveat.trim(),
    sources: theme.ids.map((id) => byId.get(id)).map(({ outlet, title, url, time }) => ({
      outlet, title, url, date: new Date(time).toISOString().slice(0, 10),
    })),
  };
}

// ── Run ─────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY && !DRY_RUN) throw new Error('ANTHROPIC_API_KEY is not set');

  const feeds = JSON.parse(await readFile(new URL('scripts/feeds.json', ROOT), 'utf8'));
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;

  const results = await Promise.allSettled(feeds.map(fetchFeed));
  const feedStatus = [];
  const seen = new Set();
  let items = [];

  results.forEach((r, i) => {
    const f = feeds[i];
    if (r.status === 'rejected') {
      feedStatus.push({ name: f.name, site: f.site, ok: false, articles: 0, error: String(r.reason?.message || r.reason) });
      return;
    }
    const recent = r.value
      .filter((it) => it.time >= cutoff && !seen.has(it.url))
      .sort((x, y) => y.time - x.time)
      .slice(0, MAX_ITEMS_PER_FEED);
    recent.forEach((it) => seen.add(it.url));
    items.push(...recent);
    feedStatus.push({ name: f.name, site: f.site, ok: true, articles: recent.length });
  });

  items = items.map((it, i) => ({ ...it, id: `a${i}` }));
  const byId = new Map(items.map((it) => [it.id, it]));
  const feedsOk = feedStatus.filter((f) => f.ok).length;

  console.log(`Feeds: ${feedsOk}/${feeds.length} responded, ${items.length} articles in the last ${LOOKBACK_DAYS} days`);
  feedStatus.filter((f) => !f.ok).forEach((f) => console.warn(`  ✗ ${f.name}: ${f.error}`));

  if (feedsOk < MIN_FEEDS_OK) throw new Error(`Only ${feedsOk} feeds responded (minimum ${MIN_FEEDS_OK}). Keeping the previous briefing.`);
  if (DRY_RUN) {
    items.slice(0, 10).forEach((it) => console.log(`  ${it.id} ${it.outlet}: ${it.title}`));
    return;
  }

  const { themes = [] } = await claude(CLUSTER_SYSTEM, items.map(fmtItem).join('\n\n'), 1500);

  // Enforce the clustering rules in code, not just in the prompt
  const used = new Set();
  const validThemes = themes.filter((t) => {
    if (!CATEGORIES[t.category] || !Array.isArray(t.ids)) { console.warn(`  ✗ theme rejected: unknown category "${t.category}"`); return false; }
    t.ids = [...new Set(t.ids)].filter((id) => byId.has(id) && !used.has(id)).slice(0, 6);
    const outlets = new Set(t.ids.map((id) => byId.get(id).outlet));
    if (t.ids.length < 2 || outlets.size < 2) { console.warn(`  ✗ ${t.category} theme rejected: needs 2+ articles from 2+ publications`); return false; }
    t.ids.forEach((id) => used.add(id));
    return true;
  });
  const seenCat = new Set();
  const finalThemes = validThemes.filter((t) => !seenCat.has(t.category) && seenCat.add(t.category));
  console.log(`Themes: ${finalThemes.length} passed validation (${themes.length} proposed)`);

  const synth = await Promise.allSettled(
    finalThemes.map((t) =>
      claude(SYNTH_SYSTEM, `Shared question: ${t.question}\n\nArticles:\n\n${t.ids.map((id) => fmtItem(byId.get(id))).join('\n\n')}`, 1800)
        .then((b) => validateBriefing(b, t, byId))
    )
  );

  const briefings = synth
    .map((r, i) => {
      const t = finalThemes[i];
      if (r.status === 'rejected') {
        console.warn(`  ✗ ${t.category}: ${r.reason?.message}`);
        console.warn(`      question: ${t.question}`);
        return null;
      }
      console.log(`  ✓ ${t.category}: ${r.value.title}`);
      return r.value;
    })
    .filter(Boolean)
    .sort((a, b) => Object.keys(CATEGORIES).indexOf(a.category) - Object.keys(CATEGORIES).indexOf(b.category));

  if (briefings.length === 0) throw new Error('No briefing passed validation. Keeping the previous briefing.');

  const out = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    model: MODEL,
    lookbackDays: LOOKBACK_DAYS,
    articlesScanned: items.length,
    feeds: feedStatus,
    briefings,
  };

  const json = JSON.stringify(out, null, 2) + '\n';
  await mkdir(new URL('data/archive/', ROOT), { recursive: true });
  await writeFile(new URL('data/briefings.json', ROOT), json);
  await writeFile(new URL(`data/archive/${out.generatedAt.slice(0, 10)}.json`, ROOT), json);
  console.log(`Wrote ${briefings.length} briefings.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`Run failed: ${err.message}`);
    process.exit(1);
  });
}
