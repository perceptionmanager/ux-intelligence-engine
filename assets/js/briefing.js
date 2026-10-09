/* UX Design Briefing: renders data/briefings.json into the page.
   Page chrome, backdrop and the line pattern come from assets/js/site.js (shared with the portfolio).
   Safety: everything that came from the model or from a feed goes through textContent, never innerHTML,
   and only http(s) links are rendered. */
(() => {
  const STALE_DAYS = 9;
  const ORDER = ['discovery', 'leadership', 'systems', 'tooling', 'operations'];
  const feedEl = document.getElementById('feed');
  const filtersEl = document.getElementById('filters');
  const statusEl = document.getElementById('runStatus');
  const runText = document.getElementById('runText');
  let selected = new Set(['all']);

  // Safe DOM builder
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().filter(Boolean).forEach((k) => n.append(k));
    return n;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  function relDays(iso) {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  }

  function setStatus(state, message) {
    statusEl.dataset.state = state;
    runText.textContent = message;
  }

  /* ---- stat row: numbers from the last run; colours follow the drifting spotlights, like a case study's stats ---- */
  function setStats(values) {
    values.forEach((v, i) => { const n = document.getElementById('stat' + i); if (n) n.textContent = v; });
  }
  function startStatColors() {
    const coral = document.getElementById('bdBlobCoral');
    const cyan = document.getElementById('bdBlobCyan');
    if (!coral || !cyan || !window.Site || !window.Site.mixColor) return;
    const CORAL = [255, 106, 76], CYAN = [69, 224, 255];   // the two accent colours the spotlights use
    const spots = [-160, 0, 160];                          // x offset of each stat from the page centre
    function paint() {
      const cs = coral.blobState || { tx: 0, ty: 0 }, ys = cyan.blobState || { tx: 0, ty: 0 };
      spots.forEach((x, i) => {
        const n = document.getElementById('stat' + i);
        if (!n) return;
        const dC = Math.hypot(x - (-200 + cs.tx), cs.ty) + 1, dY = Math.hypot(x - (200 + ys.tx), ys.ty) + 1;
        const wC = 1 / (dC * dC), wY = 1 / (dY * dY);
        n.style.color = window.Site.mixColor(CORAL, CYAN, wY / (wC + wY));
      });
    }
    setInterval(paint, 900);
    paint();
  }

  function renderBriefing(b, i) {
    const detailId = `detail-${i}`;
    const sources = (b.sources || []).filter((s) => safeUrl(s.url));
    const outletCount = new Set(sources.map((s) => s.outlet)).size;

    const toggle = el('button', { class: 'btn btn-ghost', type: 'button', 'aria-expanded': 'false', 'aria-controls': detailId, text: 'Show context and next steps' });
    const detail = el('div', { class: 'detail', id: detailId, hidden: true },
      el('div', {}, el('h4', { text: 'Context' }), el('p', { text: b.context })),
      el('div', {}, el('h4', { text: 'What to try' }),
        el('ol', { class: 'steps' }, (b.steps || []).map((s) =>
          el('li', {}, el('span', {}, el('strong', { text: s.label + '. ' }), s.text))))),
      el('p', { class: 'caveat', text: 'What these sources don’t settle: ' + b.caveat })
    );
    toggle.addEventListener('click', () => {
      const open = detail.hidden;
      detail.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide context and next steps' : 'Show context and next steps';
    });

    return el('article', { class: 'card briefing', 'data-category': b.category, 'aria-labelledby': `title-${i}` },
      el('div', { class: 'briefing-meta' },
        el('span', { class: 'tag', text: b.categoryLabel }),
        el('span', { text: `${plural(sources.length, 'article')} from ${plural(outletCount, 'publication')}` })),
      el('h2', { id: `title-${i}`, text: b.title }),
      el('p', { class: 'dek', text: b.dek }),
      el('div', { class: 'scenario' },
        el('p', { class: 'scenario-label', text: 'Illustrative scenario' }),
        el('p', { text: b.scenario })),
      el('p', { class: 'positions-head', text: b.relation === 'disagree' ? 'Where the sources disagree' : 'Where the sources put the weight' }),
      el('div', { class: 'positions' }, (b.positions || []).map((p) =>
        el('section', { class: 'position' },
          el('h3', { text: p.label }),
          el('p', { text: p.summary }),
          el('p', { class: 'argued', text: 'Argued in ' + (p.outlets || []).join(', ') })))),
      detail,
      el('div', { class: 'card-actions' }, toggle),
      el('div', { class: 'sources' },
        el('p', { class: 'sources-head', text: 'Read the sources' }),
        el('ul', {}, sources.map((s) =>
          el('li', {},
            el('a', { href: safeUrl(s.url), target: '_blank', rel: 'noopener', text: s.title }),
            el('span', { class: 'src-meta', text: `${s.outlet}, ${fmtDate(s.date + 'T12:00:00')}` })))))
    );
  }

  function applyFilter() {
    filtersEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(selected.has(c.dataset.category))));
    feedEl.querySelectorAll('.briefing').forEach((card) => {
      card.hidden = !(selected.has('all') || selected.has(card.dataset.category));
    });
  }

  function toggleFilter(cat) {
    if (cat === 'all') selected = new Set(['all']);
    else {
      selected.delete('all');
      selected.has(cat) ? selected.delete(cat) : selected.add(cat);
      if (selected.size === 0) selected.add('all');
    }
    applyFilter();
  }

  function renderFilters(briefings) {
    const cats = ORDER.filter((c) => briefings.some((b) => b.category === c));
    if (cats.length < 2) return; // a filter with one option is noise
    const labelFor = (c) => briefings.find((b) => b.category === c).categoryLabel;
    const chip = (cat, label, count) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-category': cat, 'aria-pressed': 'false' }, label, count != null ? el('span', { class: 'count', text: String(count) }) : null);
      b.addEventListener('click', () => toggleFilter(cat));
      return b;
    };
    filtersEl.append(chip('all', 'All topics'));
    cats.forEach((c) => filtersEl.append(chip(c, labelFor(c), briefings.filter((b) => b.category === c).length)));
    filtersEl.hidden = false;
    applyFilter();
  }

  function renderSources(feeds) {
    if (!Array.isArray(feeds) || !feeds.length) return;
    const list = document.getElementById('sourceList');
    feeds.forEach((f) => {
      const label = f.ok ? `${f.name} (${f.articles})` : `${f.name}, didn’t respond`;
      const item = el('li', { class: f.ok ? null : 'down' });
      const href = safeUrl(f.site);
      item.append(href ? el('a', { href, target: '_blank', rel: 'noopener', text: label }) : label);
      list.append(item);
    });
    document.getElementById('sourceStatus').hidden = false;
  }

  function notice(title, body) {
    feedEl.replaceChildren(el('div', { class: 'notice' }, el('h2', { text: title }), el('p', { text: body })));
  }

  async function load() {
    startStatColors();
    let data;
    try {
      const res = await fetch('data/briefings.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch {
      setStatus('error', 'The briefing data didn’t load.');
      notice('Briefing unavailable', 'The data file couldn’t be loaded. Refresh the page; if it still fails, the latest run may not have deployed yet.');
      return;
    }

    if (data.status !== 'ok' || !data.briefings?.length) {
      setStatus('pending', 'No briefing has been generated yet.');
      notice('First briefing pending', 'The pipeline hasn’t completed its first run. Briefings appear here after the next scheduled Monday run.');
      return;
    }

    const feeds = data.feeds || [];
    const okFeeds = feeds.filter((f) => f.ok).length;
    const ageDays = (Date.now() - new Date(data.generatedAt).getTime()) / 86400000;
    const summary = `Generated ${fmtDate(data.generatedAt)} (${relDays(data.generatedAt)}) from ${data.articlesScanned} articles across ${okFeeds} of ${feeds.length} sources.`;
    setStatus(ageDays > STALE_DAYS ? 'stale' : 'fresh', ageDays > STALE_DAYS ? summary + ' The weekly run is overdue, so this may be out of date.' : summary);
    setStats([String(data.briefings.length), String(data.articlesScanned), `${okFeeds} of ${feeds.length}`]);

    feedEl.replaceChildren(...data.briefings.map(renderBriefing));
    renderFilters(data.briefings);
    renderSources(data.feeds);
  }

  load();
})();
