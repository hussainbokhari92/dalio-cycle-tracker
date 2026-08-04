const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Parser = require('rss-parser');

const DATA_PATH = path.join(__dirname, '..', 'data', 'events.json');
const QUOTA_PATH = path.join(__dirname, '..', 'data', 'quota.json');
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';
const FRED_API_KEY = process.env.FRED_API_KEY || '';

const DAILY_LIMIT = 100;
const SAFETY_MARGIN = 10;

function loadQuota() {
  try {
    const raw = fs.readFileSync(QUOTA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { date: new Date().toISOString().split('T')[0], used: 0 };
  }
}

function saveQuota(quota) {
  fs.writeFileSync(QUOTA_PATH, JSON.stringify(quota, null, 2));
}

function getRemainingQuota() {
  const today = new Date().toISOString().split('T')[0];
  let quota = loadQuota();
  if (quota.date !== today) {
    quota = { date: today, used: 0 };
    saveQuota(quota);
  }
  return DAILY_LIMIT - quota.used;
}

function trackRequest(count = 1) {
  const quota = loadQuota();
  quota.used += count;
  saveQuota(quota);
  return quota.used;
}

const STEP_KEYWORDS = {
  1: ['leadership', 'election', 'president', 'prime minister', 'cabinet', 'appoint'],
  2: ['ai investment', 'artificial intelligence', 'frontier lab', 'openai', 'anthropic', 'innovation', 'patent', 'r&d'],
  3: ['education', 'university', 'student', 'skill', 'workforce training', 'human capital'],
  4: ['culture war', 'social media', 'algorithm', 'political divide', 'partisan', 'identity'],
  5: ['resource allocation', 'infrastructure bill', 'industrial policy', 'state investment', 'soviet wealth fund'],
  6: ['competitiveness', 'trade deficit', 'manufacturing', 'export', 'import', 'wto', 'tariff'],
  7: ['income growth', 'wage', 'salary', 'household income', 'consumer spending', 'retail sales'],
  8: ['financial center', 'stock market', 'ipo', 'reserve currency', 'capital market', 'foreign investment'],
  9: ['productivity', 'gdp per worker', 'output per hour', 'efficiency', 'labor productivity'],
  10: ['overextended', 'military spending', 'defense budget', 'global commitment', 'empire'],
  11: ['losing competitiveness', 'market share', 'offshoring', 'deindustrialization', 'trade war'],
  12: ['wealth gap', 'inequality', 'gini', 'top 1%', 'billionaire', 'poverty rate'],
  13: ['debt ceiling', 'national debt', 'budget deficit', 'treasury auction', 'fiscal deficit', 'government borrowing'],
  14: ['printing money', 'quantitative easing', 'qe', 'rate cut', 'fed balance sheet', 'monetary easing', 'inflation'],
  15: ['internal conflict', 'protest', 'riot', 'political violence', 'civil unrest', 'polarization', 'election dispute'],
  16: ['reserve currency', 'dedollarization', 'yuan internationalization', 'swift', 'currency swap', 'dollar weakness'],
  17: ['weak leadership', 'corruption', 'scandal', 'approval rating', 'impeachment', 'government shutdown'],
  18: ['civil war', 'revolution', 'coup', 'secession', 'constitutional crisis', 'state collapse']
};

const ALL_QUERIES = [
  { q: 'federal reserve interest rates OR FOMC OR fed chair', priority: 1, stepHint: 14 },
  { q: 'treasury debt deficit OR US budget OR fiscal policy', priority: 1, stepHint: 13 },
  { q: 'china economy trade surplus OR CCP OR manufacturing', priority: 1, stepHint: 8 },
  { q: 'artificial intelligence investment OR AI capex OR frontier lab', priority: 1, stepHint: 2 },
  { q: 'yen carry trade OR BOJ OR japan currency intervention', priority: 2, stepHint: 13 },
  { q: 'semiconductor chip manufacturing OR TSMC OR nvidia OR intel', priority: 2, stepHint: 11 },
  { q: 'geopolitical conflict OR sanctions OR reserve currency OR dedollarization', priority: 2, stepHint: 16 },
  { q: 'wealth inequality OR income gap OR billionaire tax OR poverty', priority: 3, stepHint: 12 },
  { q: 'US election OR political polarization OR protest OR civil unrest', priority: 3, stepHint: 15 },
  { q: 'productivity growth OR labor output OR GDP per capita', priority: 3, stepHint: 9 }
];

function getQueriesForRun() {
  const remaining = getRemainingQuota();
  const usable = Math.max(0, remaining - SAFETY_MARGIN);
  if (usable <= 0) {
    console.log(`NewsAPI quota exhausted (${remaining} remaining). Skipping NewsAPI.`);
    return [];
  }
  const sorted = [...ALL_QUERIES].sort((a, b) => a.priority - b.priority);
  let toRun = [];
  let budget = usable;
  for (const query of sorted) {
    if (budget <= 0) break;
    toRun.push(query);
    budget--;
  }
  console.log(`NewsAPI budget: ${usable} requests available, running ${toRun.length} queries`);
  return toRun;
}

function detectSourceType(source) {
  const s = source.toLowerCase();
  if (s.includes('fed') || s.includes('central bank') || s.includes('ecb') || s.includes('boj')) return 'fed';
  if (s.includes('treasury') || s.includes('ministry of finance')) return 'treasury';
  if (s.includes('bureau') || s.includes('statistics') || s.includes('census') || s.includes('imf') || s.includes('world bank')) return 'data';
  if (s.includes('reuters') || s.includes('bloomberg') || s.includes('ft') || s.includes('wsj') || s.includes('nyt') || s.includes('zerohedge') || s.includes('cnbc') || s.includes('marketwatch') || s.includes('seeking alpha')) return 'news';
  return 'geopolitical';
}

function detectRegion(title, summary) {
  const text = (title + ' ' + (summary || '')).toLowerCase();
  if (text.includes('china') || text.includes('chinese') || text.includes('ccp') || text.includes('beijing') || text.includes('shanghai')) return 'china';
  if (text.includes('japan') || text.includes('japanese') || text.includes('tokyo') || text.includes('boj') || text.includes('yen')) return 'japan';
  if (text.includes('europe') || text.includes('eu ') || text.includes('european') || text.includes('ecb') || text.includes('germany') || text.includes('france') || text.includes('uk ') || text.includes('britain')) return 'europe';
  if (text.includes('us ') || text.includes('united states') || text.includes('american') || text.includes('washington') || text.includes('federal reserve') || text.includes('treasury')) return 'us';
  return 'global';
}

function autoTag(title, summary, source, stepHint) {
  const text = (title + ' ' + (summary || '')).toLowerCase();
  const matches = [];
  for (const [step, keywords] of Object.entries(STEP_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matches.push(parseInt(step));
        break;
      }
    }
  }
  if (matches.length > 0) return matches[0];
  if (stepHint) return stepHint;
  const sourceType = detectSourceType(source);
  if (sourceType === 'fed') return 14;
  if (sourceType === 'treasury') return 13;
  return 10;
}

function loadEvents() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { lastUpdated: new Date().toISOString(), events: [] };
  }
}

function saveEvents(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

async function fetchNewsAPI() {
  if (!NEWSAPI_KEY) {
    console.log('No NEWSAPI_KEY set. Skipping NewsAPI.');
    return [];
  }
  const queries = getQueriesForRun();
  if (queries.length === 0) return [];
  const all = [];
  for (const queryObj of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(queryObj.q)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${NEWSAPI_KEY}`;
      const res = await fetch(url);
      trackRequest(1);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === 'rateLimited') {
          console.log('NewsAPI rate limit hit! Stopping NewsAPI fetches.');
          break;
        }
        console.error(`NewsAPI error: ${res.status} - ${errData.message || 'unknown'}`);
        continue;
      }
      const data = await res.json();
      if (data.articles) {
        data.articles.forEach(a => { a._stepHint = queryObj.stepHint; a._fromNewsAPI = true; });
        all.push(...data.articles);
      }
    } catch (e) {
      console.error('NewsAPI fetch error:', e.message);
    }
  }
  console.log(`NewsAPI used ${loadQuota().used}/${DAILY_LIMIT} requests today`);
  return all;
}

async function fetchRSS() {
  const parser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'DalioCycleTracker/1.0' }
  });

  // Only feeds known to work from GitHub Actions runners
  const feeds = [
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business' },
    { url: 'https://rss.cnn.com/rss/money_news_international.rss', name: 'CNN Money' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC Markets' },
    { url: 'https://www.marketwatch.com/rss/topstories', name: 'MarketWatch' },
    { url: 'https://seekingalpha.com/feed.xml', name: 'Seeking Alpha' },
    { url: 'https://www.zerohedge.com/rss.xml', name: 'ZeroHedge' },
    { url: 'https://www.realclearmarkets.com/index.xml', name: 'RealClearMarkets' },
    { url: 'https://www.politico.com/rss/politicopicks.xml', name: 'Politico' },
    { url: 'https://www.axios.com/feeds/feed.rss', name: 'Axios' },
    { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR News' },
    { url: 'https://www.scmp.com/rss/91/feed', name: 'South China Morning Post' },
    { url: 'https://www.japantimes.co.jp/feed/', name: 'Japan Times' }
  ];

  const all = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      parsed.items.slice(0, 4).forEach(item => {
        all.push({
          title: item.title,
          description: item.contentSnippet || item.content || item.summary || '',
          url: item.link,
          publishedAt: item.pubDate || item.isoDate,
          source: { name: feed.name },
          _fromRSS: true
        });
      });
      console.log(`RSS OK: ${feed.name} (${parsed.items.length} items)`);
    } catch (e) {
      // Log but don't crash — RSS is best-effort
      console.error(`RSS SKIP: ${feed.name} (${e.code || e.message})`);
    }
  }
  return all;
}

async function fetchGDELT() {
  console.log('Fetching from GDELT...');
  const themes = [
    { theme: 'ECONOMIC', stepHint: 7 },
    { theme: 'FINANCIAL', stepHint: 8 },
    { theme: 'TAXATION', stepHint: 13 },
    { theme: 'DEBT', stepHint: 13 },
    { theme: 'TRADE', stepHint: 6 },
    { theme: 'TARIFF', stepHint: 6 },
    { theme: 'INFLATION', stepHint: 14 },
    { theme: 'UNEMPLOYMENT', stepHint: 7 },
    { theme: 'CURRENCY', stepHint: 16 },
    { theme: 'SANCTIONS', stepHint: 10 },
    { theme: 'WAR', stepHint: 10 },
    { theme: 'CONFLICT', stepHint: 15 }
  ];
  const all = [];
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startDate = sevenDaysAgo.toISOString().split('T')[0].replace(/-/g, '');
  const endDate = today.toISOString().split('T')[0].replace(/-/g, '');

  for (const { theme, stepHint } of themes) {
    try {
      const query = `theme:"${theme}"`;
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=3&format=json&startdatetime=${startDate}000000&enddatetime=${endDate}235959`;
      const res = await fetch(url, { timeout: 15000 });
      if (!res.ok) {
        console.error(`GDELT skip ${theme}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data.articles && Array.isArray(data.articles)) {
        data.articles.forEach(article => {
          all.push({
            title: article.title || 'Untitled',
            description: article.seenagent || article.domain || '',
            url: article.url,
            publishedAt: article.seendate ? article.seendate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : new Date().toISOString(),
            source: { name: article.domain || 'GDELT' },
            _stepHint: stepHint,
            _fromGDELT: true
          });
        });
      }
    } catch (e) {
      console.error(`GDELT skip ${theme}: ${e.message}`);
    }
  }
  console.log(`GDELT fetched ${all.length} articles`);
  return all;
}

const FRED_SERIES = [
  { id: 'CPIAUCSL', name: 'Consumer Price Index', step: 14, region: 'us', watch: 'Watch month-over-month change and core CPI trend.' },
  { id: 'CPILFESL', name: 'Core CPI (ex-food/energy)', step: 14, region: 'us', watch: 'Fed watches this more than headline CPI.' },
  { id: 'UNRATE', name: 'Unemployment Rate', step: 7, region: 'us', watch: 'Watch for inflection points — labor market weakening signals recession risk.' },
  { id: 'PAYEMS', name: 'Nonfarm Payrolls', step: 7, region: 'us', watch: 'Monthly jobs number is the most market-moving data release.' },
  { id: 'BOPGSTB', name: 'Trade Balance', step: 6, region: 'us', watch: 'Widening deficit = more foreign capital inflows needed.' },
  { id: 'GFDEBTN', name: 'Federal Debt', step: 13, region: 'us', watch: 'Debt trajectory relative to GDP. The shock absorber, not the shock.' },
  { id: 'FEDFUNDS', name: 'Federal Funds Rate', step: 14, region: 'us', watch: 'Warsh holding steady to underwrite AI capex. Watch dissent votes.' },
  { id: 'DGS10', name: '10-Year Treasury Yield', step: 13, region: 'us', watch: 'Real yields falling while deficit widens = forced inflows thesis intact.' },
  { id: 'DTWEXBGS', name: 'Trade-Weighted Dollar Index', step: 16, region: 'us', watch: 'Dollar strength despite deficits validates the reserve currency machine.' },
  { id: 'M2SL', name: 'M2 Money Supply', step: 14, region: 'us', watch: 'Money supply growth vs. velocity. Signals liquidity conditions.' },
  { id: 'GDP', name: 'Gross Domestic Product', step: 9, region: 'us', watch: 'Real GDP growth vs. productivity. AI capex should eventually show here.' }
];

async function fetchFRED() {
  if (!FRED_API_KEY) {
    console.log('No FRED_API_KEY set. Skipping FRED.');
    return [];
  }
  console.log('Fetching from FRED...');
  const events = [];
  for (const series of FRED_SERIES) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
      const res = await fetch(url, { timeout: 15000 });
      if (!res.ok) {
        console.error(`FRED skip ${series.id}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!data.observations || data.observations.length === 0) continue;
      const latest = data.observations[0];
      const prev = data.observations[1];
      const obsDate = new Date(latest.date);
      const daysOld = (new Date() - obsDate) / (1000 * 60 * 60 * 24);
      if (daysOld > 30) continue;
      const dataObj = loadEvents();
      const alreadyExists = dataObj.events.some(e => e.source === 'FRED' && e.title.includes(series.name) && e.date === latest.date);
      if (alreadyExists) continue;
      const change = prev && prev.value !== '.' && latest.value !== '.' ? ((parseFloat(latest.value) - parseFloat(prev.value)) / parseFloat(prev.value) * 100).toFixed(2) : null;
      const changeStr = change ? ` (${change > 0 ? '+' : ''}${change}% vs prior)` : '';
      events.push({
        title: `${series.name}: ${latest.value}${changeStr}`,
        url: `https://fred.stlouisfed.org/series/${series.id}`,
        date: latest.date,
        source: 'FRED',
        sourceType: 'data',
        region: series.region,
        step: series.step,
        summary: `Latest ${series.name} released: ${latest.value} for ${latest.date}. ${series.watch}`,
        dalioConnection: `Step ${series.step} data release. ${series.name} is a key indicator for tracking the empire cycle.`,
        thesisConnection: series.watch,
        watch: series.watch,
        tags: ['fred', 'economic-data', series.id.toLowerCase()]
      });
      console.log(`FRED: ${series.name} = ${latest.value} (${latest.date})`);
    } catch (e) {
      console.error(`FRED skip ${series.id}: ${e.message}`);
    }
  }
  console.log(`FRED created ${events.length} new events`);
  return events;
}

function dedupe(events) {
  const seen = new Set();
  return events.filter(e => {
    const url = e.url || e.link;
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

async function main() {
  console.log('=== Dalio Cycle News Fetch ===');
  console.log(`Date: ${new Date().toISOString()}`);
  const data = loadEvents();
  const existingUrls = new Set(data.events.map(e => e.url));
  let maxId = data.events.reduce((m, e) => Math.max(m, e.id), 0);

  const [newsAPIArticles, rssArticles, gdeltArticles, fredEvents] = await Promise.all([
    fetchNewsAPI(), fetchRSS(), fetchGDELT(), fetchFRED()
  ]);

  const allArticles = dedupe([...newsAPIArticles, ...rssArticles, ...gdeltArticles]);

  let added = 0;
  for (const article of allArticles) {
    const url = article.url || article.link;
    if (!url || existingUrls.has(url)) continue;
    const title = article.title || '';
    const summary = article.description || article.content || '';
    const sourceName = article.source?.name || 'Unknown';
    const date = article.publishedAt ? article.publishedAt.split('T')[0] : new Date().toISOString().split('T')[0];
    const stepHint = article._stepHint || null;
    const step = autoTag(title, summary, sourceName, stepHint);
    const region = detectRegion(title, summary);
    const sourceType = detectSourceType(sourceName);
    const tags = ['auto-fetched'];
    if (article._fromNewsAPI) tags.push('newsapi');
    if (article._fromRSS) tags.push('rss');
    if (article._fromGDELT) tags.push('gdelt');
    maxId++;
    data.events.push({
      id: maxId, title: title.slice(0, 200), url, date,
      source: sourceName, sourceType, region, step,
      summary: summary.slice(0, 400),
      dalioConnection: `Auto-tagged to Step ${step}. Review needed for Dalio context.`,
      thesisConnection: 'Auto-generated. Please review and add capital flow thesis context.',
      watch: 'Monitor follow-on developments.',
      tags
    });
    added++;
  }

  for (const ev of fredEvents) {
    if (existingUrls.has(ev.url)) continue;
    maxId++;
    data.events.push({ ...ev, id: maxId });
    added++;
  }

  if (data.events.length > 500) data.events = data.events.slice(-500);
  saveEvents(data);
  console.log(`\n=== Summary ===`);
  console.log(`Added ${added} new events. Total: ${data.events.length}`);
  console.log(`NewsAPI quota used today: ${loadQuota().used}/${DAILY_LIMIT}`);
}

main().catch(console.error);
