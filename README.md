# UX Design Briefing (UX Intelligence Engine)

A weekly briefing on what UX and product practitioners are debating. A GitHub
Action pulls recent articles from design publications, Claude groups them by a
shared question and writes one briefing per topic, and the result is committed
as static JSON that the page renders. Every briefing links to its source articles.

## Structure

```
index.html                 Page markup (same header, backdrop, cards and footer as the portfolio case studies; no links back to the portfolio, it opens on its own)
assets/css/site.css        Styles: a synced copy of the portfolio's shared CSS + this page's own (.pg-briefing)
assets/js/site.js          Copy of the portfolio's site.js (menu, scroll bar, drifting spotlights, line pattern)
assets/js/briefing.js      Renders data/briefings.json (textContent only)
assets/img/                NN/g badge, self-hosted
data/briefings.json        Latest run output (starts as "pending")
data/archive/              Dated copy of every successful run
scripts/feeds.json         Publications to read — edit freely
scripts/ingest.mjs         Pipeline: fetch → group → synthesize → validate → write
.github/workflows/ingest.yml  Runs Mondays 12:00 UTC, plus a manual button
vercel.json                No-cache header on data/ so new runs show immediately; short cache on css/js, 7 days on images
```

## Setup

1. Fork or clone this repo (`perceptionmanager/ux-intelligence-engine`) into your own GitHub account.
2. Repo → Settings → Secrets and variables → Actions:
   - Secret `ANTHROPIC_API_KEY`
   - Optional variable `MODEL` (defaults to `claude-sonnet-5-5`)
3. Repo → Actions → "Weekly briefing" → **Run workflow** for the first run.
   Check the log: it lists which feeds responded and which themes passed validation.
4. Import the repo in Vercel (Framework preset: Other, no build command).
   Each run commits new JSON, which triggers a redeploy.

Local test without API calls: `npm ci && npm run ingest:dry` (fetches feeds only).

## Guardrails

- Fewer than 3 feeds respond → run fails, nothing is written, previous briefing stays.
- A theme needs ≥2 articles from ≥2 publications (enforced in code, not just the prompt).
- A briefing that cites an article outside its group, or gives both positions the
  same citations, is discarded.
- Source links come from the feeds, never from the model.
- Model output is rendered with `textContent` only; non-http(s) URLs are dropped.
- The page shows the real run date, article count, and feed status, and flags the
  briefing as overdue if the last run is more than 9 days old.

## Known limits

- Claude sees titles and RSS excerpts only, not full articles. The page says so.
- Feeds change or disappear. Each run logs which feeds responded; replace any that fail in `scripts/feeds.json`.

## Staying in sync with the portfolio

`assets/css/site.css` (the "components" layer) and `assets/js/site.js` are copies of the shared parts of
perceptionmanager.com's `assets/css/base.css` (everything above its first "Page:" section) and `assets/js/site.js`.
Change them in the portfolio first, then re-copy, so the two sites never drift apart. The longer-term plan is to
move this shared chrome and the backdrop into the design system and load it from there in every product.

The page opts out of the animated line pattern with `<body data-backdrop-lines="off">`.

## License

Code is MIT-licensed (see `LICENSE`). The NN/g UX Certified badge in `assets/img/` is Nielsen Norman Group's mark and is not covered by that license.
