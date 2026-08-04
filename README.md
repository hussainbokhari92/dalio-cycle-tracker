# dalio-cycle-tracker
Ray Dalio Cycle Tracker

An open-source web tracker that maps global macro news and events to Ray Dalio's 18-step empire cycle, with an overlay of the international capital flow thesis.

**Live at:** `https://yourusername.github.io/dalio-cycle-tracker`

---

## What It Tracks

| Source | Coverage | API Key Required |
|--------|----------|------------------|
| **NewsAPI** | 10,000+ news sources worldwide | Free key (100 req/day) |
| **RSS Feeds** | BBC, CNN, CNBC, MarketWatch, ZeroHedge, Politico, Axios, NPR, SCMP, Japan Times + more | None |
| **GDELT** | Global geopolitical events database | None |
| **FRED** | CPI, jobs, trade balance, debt, rates, dollar, M2, GDP | Free key |

Each event is tagged to a specific step in Dalio's cycle and includes connections to both the Dalio framework and the capital flow thesis.

---

## The 18 Steps

| Phase | Steps | Description |
|-------|-------|-------------|
| **Rise** | 1–8 | Strong leadership, inventiveness, education, culture, resource allocation, competitiveness, income growth, financial centers |
| **Top** | 9–12 | Less productive, overextended, losing competitiveness, wealth gaps |
| **Decline** | 13–18 | Large debts, printing money, internal conflict, loss of reserve currency, weak leadership, civil war / revolution |

---

## Quick Start

### 1. Create a GitHub repo
Name it `dalio-cycle-tracker` (or anything you want).

### 2. Upload the files

```
dalio-cycle-tracker/
├── index.html              # The web app
├── data/
│   ├── events.json         # Event database
│   └── quota.json          # NewsAPI usage tracker
├── scripts/
│   ├── fetch-news.js       # News scraper
│   └── package.json        # Node dependencies
├── .github/
│   └── workflows/
│       └── daily-update.yml # GitHub Actions automation
├── README.md
└── LICENSE
```

### 3. Enable GitHub Pages

Go to **Settings → Pages** in your repo:
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`
- Save. Site goes live at `https://yourusername.github.io/dalio-cycle-tracker`

### 4. Add API keys (optional but recommended)

**NewsAPI key** — for news article fetching:
1. Get a free key at [newsapi.org](https://newsapi.org) (100 requests/day)
2. In your repo: **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `NEWSAPI_KEY`

**FRED API key** — for economic data releases:
1. Get a free key at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
2. In your repo: **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `FRED_API_KEY`

Without API keys, RSS feeds and GDELT still work. You just miss NewsAPI articles and FRED data.

### 5. Trigger the first run

Go to **Actions → Daily News Update → Run workflow** to test it manually.

---

## Architecture

**No backend.** The entire app is a static site served by GitHub Pages. A GitHub Actions workflow runs daily to fetch news, auto-tag events to Dalio steps, and commit updates back to the repo.

---

## How to Add Events Manually

Edit `data/events.json` and add an event:

```json
{
  "id": 11,
  "title": "Your Event Title",
  "url": "https://source-url.com/article",
  "date": "2026-08-04",
  "source": "Source Name",
  "sourceType": "news",
  "region": "us",
  "step": 14,
  "summary": "Brief summary...",
  "dalioConnection": "How this maps to Dalio's cycle...",
  "thesisConnection": "How this connects to the capital flow thesis...",
  "watch": "What traders should monitor next...",
  "tags": ["tag1", "tag2"]
}
```

**Field reference:**
- `step`: 1–18 (Dalio cycle step)
- `sourceType`: `news`, `fed`, `treasury`, `data`, `geopolitical`
- `region`: `us`, `china`, `europe`, `japan`, `global`
- `dalioConnection`: Dalio framework relevance
- `thesisConnection`: Capital flow / macro endgame relevance
- `watch`: Actionable next steps for traders

---

## Auto-Tagging

The `fetch-news.js` script uses keyword matching to auto-tag articles to Dalio steps. Auto-tagged events are marked with `"tags": ["auto-fetched"]` — community review is encouraged to refine connections.

---

## NewsAPI Quota Management

The tracker is smart about your 100 request/day limit:

| Scenario | NewsAPI Used | RSS | GDELT | FRED |
|----------|-------------|-----|-------|------|
| Full quota | ~4–6 (priority 1 + some 2) | Yes | Yes | Yes |
| Half quota | ~2–3 (priority 1 only) | Yes | Yes | Yes |
| Near limit (< 10 left) | 0 (skipped) | Yes | Yes | Yes |
| No key | 0 | Yes | Yes | No |

Priority 1 queries (Fed, Treasury, China, AI) always run first. A 10-request safety margin prevents hitting the hard limit.

---

## Features

- **Interactive cycle arc** — click any of the 18 steps to filter events
- **Event cards** — title, date, source, region, step tag
- **Detail panel** — Dalio connection, capital flow thesis connection, "what to watch"
- **Filters** — search by text, region, source type, or phase (rise / top / decline)
- **Chart** — stacked bar chart of event frequency by month, colored by phase
- **Auto-fetching** — NewsAPI + RSS + GDELT + FRED daily via GitHub Actions

---

## Customization

### Change colors
Edit CSS variables in `index.html`:
```css
:root {
  --rise: #4ade80;
  --top: #fbbf24;
  --decline: #f87171;
  --accent: #5b8def;
}
```

### Add RSS feeds
Edit `scripts/fetch-news.js`:
```javascript
const feeds = [
  { url: 'https://YOUR_FEED.com/rss', name: 'Your Feed' },
  // ...
];
```

### Change update frequency
Edit `.github/workflows/daily-update.yml`:
```yaml
schedule:
  - cron: '0 6 * * *'    # Daily at 6 AM UTC
  - cron: '0 */6 * * *'   # Every 6 hours
```

### Add FRED series
Edit `FRED_SERIES` in `scripts/fetch-news.js`:
```javascript
{ id: 'YOUR_SERIES', name: 'Series Name', step: 14, region: 'us', watch: 'What to watch.' }
```

---

## Roadmap

- [x] NewsAPI integration with quota management
- [x] RSS feed aggregation
- [x] GDELT geopolitical events
- [x] FRED economic data releases
- [x] Event frequency chart by step
- [ ] Email digest of daily events
- [ ] Community voting on event relevance
- [ ] Export to CSV / JSON
- [ ] Mobile app wrapper

---

## Credits

- Ray Dalio — *Principles for Dealing with the Changing World Order*
- Capital flow thesis — analysis of Warsh, Bessent, Druckenmiller coordination
- [GDELT Project](https://gdeltproject.org)
- [FRED / Federal Reserve Bank of St. Louis](https://fred.stlouisfed.org)

---

## License

MIT — see [LICENSE](LICENSE).
'''

with open("/mnt/agents/output/dalio-cycle-tracker/README.md", "w") as f:
    f.write(readme)

print("README.md written")
