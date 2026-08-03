const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const Parser = require('rss-parser');

const DATA_PATH = path.join(__dirname, '..', 'data', 'events.json');
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';

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

function detectSourceType(source) {
  const s = source.toLowerCase();
  if (s.includes('fed') || s.includes('central bank') || s.includes('ecb') || s.includes('boj')) return 'fed';
  if (s.includes('treasury') || s.includes('ministry of finance')) return 'treasury';
  if (s.includes('bureau') || s.includes('statistics') || s.includes('census') || s.includes('imf') || s.includes('world bank')) return 'data';
  if (s.includes('reuters') || s.includes('bloomberg') || s.includes('ft') || s.includes('wsj') || s.includes('nyt')) return 'news';
  return 'geopolitical';
}

function detectRegion(title, summary) {
  const text = (title + ' ' + summary).toLowerCase();
  if (text.includes('china') || text.includes('chinese') || text.includes('ccp') || text.includes('beijing') || text.includes('shanghai')) return 'china';
  if (text.includes('japan') || text.includes('japanese') || text.includes('tokyo') || text.includes('boj') || text.includes('yen')) return 'japan';
  if (text.includes('europe') || text.includes('eu ') || text.includes('european') || text.includes('ecb') || text.includes('germany') || text.includes('france')) return 'europe';
  if (text.includes('us ') || text.includes('united states') || text.includes('american') || text.includes('washington') || text.includes('federal reserve') || text.includes('treasury')) return 'us';
  return 'global';
}

function autoTag(title, summary, source) {
  const text = (title + ' ' + summary).toLowerCase();
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
  const sourceType = detectSourceType(source);
  if (sourceType === 'fed') return 14;
  if (sourceType === 'treasury') return 13;
  return 10;
}

async function fetchNewsAPI() {
  if (!NEWSAPI_KEY) {
    console.log('No NEWSAPI_KEY, skipping NewsAPI');
    return [];
  }
  const queries = [
    'federal reserve interest rates',
    'treasury debt deficit',
    'china economy trade surplus',
    'artificial intelligence investment',
    'yen carry trade currency',
    'semiconductor chip manufacturing',
    'geopolitical conflict reserve currency'
  ];
  const all = [];
  for (const q of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${NEWSAPI_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.articles) {
        all.push(...data.articles);
      }
    } catch (e) {
      console.error('NewsAPI error:', e.message);
    }
  }
  return all;
}

async function fetchRSS() {
  const parser = new Parser();
  const feeds = [
    'https://feeds.reuters.com/reuters/businessNews',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.cnn.com/rss/money_news_international.rss'
  ];
  const all = [];
  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      all.push(...feed.items.slice(0, 5).map(item => ({
        title: item.title,
        description: item.contentSnippet || item.content || '',
        url: item.link,
        publishedAt: item.pubDate || item.isoDate,
        source: { name: feed.title || 'RSS Feed' }
      })));
    } catch (e) {
      console.error('RSS error:', e.message);
    }
  }
  return all;
}

function dedupe(events) {
  const seen = new Set();
  return events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

async function main() {
  console.log('Starting news fetch...');
  const data = loadEvents();
  const existingUrls = new Set(data.events.map(e => e.url));
  let maxId = data.events.reduce((m, e) => Math.max(m, e.id), 0);

  const newsAPIArticles = await fetchNewsAPI();
  const rssArticles = await fetchRSS();
  const allArticles = dedupe([...newsAPIArticles, ...rssArticles]);

  let added = 0;
  for (const article of allArticles) {
    const url = article.url || article.link;
    if (!url || existingUrls.has(url)) continue;

    const title = article.title || '';
    const summary = article.description || article.content || '';
    const sourceName = article.source?.name || 'Unknown';
    const date = article.publishedAt ? article.publishedAt.split('T')[0] : new Date().toISOString().split('T')[0];
    const step = autoTag(title, summary, sourceName);
    const region = detectRegion(title, summary);
    const sourceType = detectSourceType(sourceName);

    maxId++;
    data.events.push({
      id: maxId,
      title: title.slice(0, 200),
      url: url,
      date: date,
      source: sourceName,
      sourceType: sourceType,
      region: region,
      step: step,
      summary: summary.slice(0, 400),
      dalioConnection: `Auto-tagged to Step ${step}: ${STEP_KEYWORDS[step]?.[0] || 'general macro'}. Review needed.`,
      thesisConnection: 'Auto-generated. Please review and add capital flow thesis context.',
      watch: 'Monitor follow-on developments.',
      tags: ['auto-fetched']
    });
    added++;
  }

  if (data.events.length > 500) {
    data.events = data.events.slice(-500);
  }

  saveEvents(data);
  console.log(`Added ${added} new events. Total: ${data.events.length}`);
}

main().catch(console.error);
