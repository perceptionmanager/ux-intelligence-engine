# UX Design Briefing (UX Intelligence Engine)

A weekly briefing on what UX and product practitioners are debating. A GitHub
Action pulls recent articles from design publications, Claude groups them by a
shared question and writes one briefing per topic, and the result is committed
as static JSON that the page renders. Every briefing links to its source articles.

## Structure

```
index.html                 Page markup, inside the design system's page shell (compact header: name, credential, Let's connect; footer; backdrop)
assets/css/site.css        This page's own styles (.pg-briefing); shell and components come from the design system
assets/icons.svg, logos.svg  Copies of the design system's icon and footer-logo sprites (SVG <use> needs them on this origin)
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

## Design system

The header, mobile menu, footer and animated backdrop are the design system's page shell, loaded from
`perceptionmanager/design-system@v0.5.0` (`tokens.css`, `components.css`, `shell.css`, `shell.js`), the same files
the portfolio loads. Change them in the design system and bump the version here; don't restyle them in `site.css`.
Markup reference: the design system's `docs/shell.md`.

## License

Code is MIT-licensed (see `LICENSE`). The NN/g UX Certified badge in `assets/img/` is Nielsen Norman Group's mark and is not covered by that license.
