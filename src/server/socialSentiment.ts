import type { IncomingHttpHeaders } from 'node:http';
import { extendedStorage } from './storage';

const FETCH_TIMEOUT = 8000;
const REDDIT_USER_AGENT = 'MyDailyMonitor/1.0';

const COMMON_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'NVDA', 'META',
  'NFLX', 'AMD', 'INTC', 'IBM', 'ORCL', 'CRM', 'ADBE', 'QCOM', 'TXN',
  'AVGO', 'COST', 'WMT', 'HD', 'LOW', 'DIS', 'NKE', 'MCD', 'SBUX',
  'BA', 'JPM', 'GS', 'BAC', 'C', 'WFC', 'V', 'MA', 'PYPL', 'SQ',
  'GME', 'AMC', 'BB', 'PLTR', 'SNAP', 'RBLX', 'UBER', 'LYFT',
  'BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'DOT', 'LINK', 'AVAX',
]);

interface PostBase {
  title: string;
  url: string;
  score: number;
  platform: string;
  thumbnail?: string;
}

export interface MentionCount {
  symbol: string;
  count: number;
  positiveCount: number;
  negativeCount: number;
  sentiment: number;
  source: string;
  posts: PostBase[];
}

interface RedditPost {
  title: string;
  selftext: string;
  url: string;
  score: number;
  permalink: string;
  thumbnail: string;
}

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 3 * 60_000;

// ─── Database Persistence Helpers ─────────────────────────────────────────────
async function persistMentionsToDb(mentions: MentionCount[], posts: RedditPost[]): Promise<void> {
  if (!extendedStorage || !mentions.length) return;
  try {
    for (const mention of mentions.slice(0, 10)) {
      const instrument = await extendedStorage.getInstrumentBySymbol(mention.symbol);
      if (!instrument) continue;

      const persisted = await extendedStorage.persistSocialMention({
        instrumentId: instrument.id,
        symbol: mention.symbol,
        platform: 'reddit',
        count: mention.count,
        positiveCount: mention.positiveCount,
        negativeCount: mention.negativeCount,
        sentiment: mention.sentiment,
        source: mention.source,
      });

      if (persisted) {
        for (const post of mention.posts.slice(0, 5)) {
          await extendedStorage.persistSocialPost({
            mentionId: persisted.id,
            title: post.title,
            url: post.url,
            score: post.score,
            platform: post.platform,
            thumbnail: post.thumbnail,
          });
        }
      }
    }
  } catch (e) {
    console.error("Failed to persist social mentions:", e);
  }
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return Promise.resolve(entry.data as T);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

function extractTickers(title: string, selftext: string): string[] {
  const text = `${title} ${selftext}`;
  const found: string[] = [];
  const dollarMatches = Array.from(text.matchAll(/\$([A-Z]{2,5})\b/g));
  for (const m of dollarMatches) {
    if (COMMON_TICKERS.has(m[1])) found.push(m[1]);
  }
  const bareMatches = Array.from(text.matchAll(/\b([A-Z]{2,5})\b/g));
  for (const m of bareMatches) {
    if (COMMON_TICKERS.has(m[1])) found.push(m[1]);
  }
  return found;
}

async function redditFetch(url: string): Promise<any> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const headers: Record<string, string> = { 'User-Agent': REDDIT_USER_AGENT };

  if (clientId && clientSecret) {
    const tokenResp = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_USER_AGENT,
      },
      body: 'grant_type=client_credentials',
    });
    if (tokenResp.ok) {
      const tokenData = (await tokenResp.json()) as any;
      if (tokenData.access_token) {
        headers['Authorization'] = `Bearer ${tokenData.access_token}`;
      }
    }
  }

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!resp.ok) throw new Error(`Reddit ${resp.status}`);
  return resp.json();
}

async function fetchRedditPosts(subreddits: string[]): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  const results = await Promise.allSettled(
    subreddits.map(sub =>
      cached(`sentiment-reddit-${sub}`, async () => {
        const data = await redditFetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`);
        return (data.data?.children || [])
          .filter((c: any) => c.data && !c.data.stickied)
          .map((c: any) => {
            const thumb = c.data.thumbnail?.startsWith('http') ? c.data.thumbnail : '';
            const preview = c.data.preview?.images?.[0]?.source?.url;
            return {
              title: c.data.title || '',
              selftext: c.data.selftext || '',
              url: c.data.url?.startsWith('http') ? c.data.url : `https://reddit.com${c.data.permalink}`,
              score: c.data.score || 0,
              permalink: c.data.permalink || '',
              thumbnail: preview || thumb || '',
            };
          });
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled') posts.push(...r.value);
  }
  return posts;
}

function countMentions(posts: RedditPost[], filterSymbol?: string): MentionCount[] {
  const mentions = new Map<string, { count: number; positiveCount: number; negativeCount: number; posts: PostBase[] }>();

  const POSITIVE_WORDS = /\b(bullish|moon|pump|buy|long|hodl|lambo|rocket|beat|win|profit|mooning|breakout|strong|growth|green|upgrade|surge|soar)\b/gi;
  const NEGATIVE_WORDS = /\b(bearish|dump|sell|short|crash|down|loss|bear|rug|scam|fail|plunge|drop|red|downgrade|fear|panic|bleeding)\b/gi;

  for (const post of posts) {
    const tickers = extractTickers(post.title, post.selftext);
    const uniqueTickers = Array.from(new Set(tickers));

    for (const symbol of uniqueTickers) {
      if (filterSymbol && symbol !== filterSymbol) continue;

      if (!mentions.has(symbol)) {
        mentions.set(symbol, { count: 0, positiveCount: 0, negativeCount: 0, posts: [] });
      }

      const entry = mentions.get(symbol)!;
      entry.count++;
      entry.posts.push({
        title: post.title,
        url: post.url,
        score: post.score,
        platform: 'reddit',
        thumbnail: post.thumbnail || undefined,
      });

      const text = `${post.title} ${post.selftext}`;
      const posMatches = text.match(POSITIVE_WORDS);
      const negMatches = text.match(NEGATIVE_WORDS);
      if (posMatches) entry.positiveCount += posMatches.length;
      if (negMatches) entry.negativeCount += negMatches.length;
    }
  }

  return Array.from(mentions.entries())
    .map(([symbol, data]: [string, { count: number; positiveCount: number; negativeCount: number; posts: PostBase[] }]) => {
      const totalKeywords = data.positiveCount + data.negativeCount;
      const sentiment = totalKeywords > 0 ? Number(((data.positiveCount - data.negativeCount) / totalKeywords).toFixed(3)) : 0;
      return {
        symbol,
        count: data.count,
        positiveCount: data.positiveCount,
        negativeCount: data.negativeCount,
        sentiment: Math.max(-1, Math.min(1, sentiment)),
        source: 'reddit',
        posts: data.posts.sort((a, b) => b.score - a.score).slice(0, 10),
      };
    })
    .sort((a, b) => b.count - a.count);
}

// ─── Sentiment source testing ─────────────────────────────────────────────

export interface SentimentSourceStatus {
  name: string;
  subreddit: string;
  ok: boolean;
  latency: number;
  statusCode: number;
  postCount?: number;
}

export interface SentimentSourceTestResult {
  ok: boolean;
  statusCode: number;
  postCount: number;
  body: string;
}

const SENTIMENT_SUBREDDITS = [
  { name: "Reddit r/wallstreetbets", subreddit: "wallstreetbets" },
  { name: "Reddit r/stocks", subreddit: "stocks" },
  { name: "Reddit r/CryptoCurrency", subreddit: "CryptoCurrency" },
  { name: "Reddit r/Investing", subreddit: "investing" },
];

export async function testSentimentSource(subreddit: string): Promise<SentimentSourceTestResult> {
  const start = Date.now();
  try {
    const resp = await redditFetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=5&raw_json=1`);
    const posts = (resp.data?.children || []).filter((c: any) => c.data && !c.data.stickied);
    const body = JSON.stringify(
      posts.slice(0, 3).map((c: any) => ({
        title: c.data.title,
        score: c.data.score,
        num_comments: c.data.num_comments,
      })),
      null,
      2
    );
    return { ok: true, statusCode: 200, postCount: posts.length, body };
  } catch (e) {
    return { ok: false, statusCode: 0, postCount: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

export async function getSentimentSourceStatuses(): Promise<SentimentSourceStatus[]> {
  const results = await Promise.allSettled(
    SENTIMENT_SUBREDDITS.map(async (source) => {
      const start = Date.now();
      try {
        const resp = await redditFetch(`https://www.reddit.com/r/${source.subreddit}/hot.json?limit=1&raw_json=1`);
        const postCount = (resp.data?.children || []).length;
        return {
          name: source.name,
          subreddit: source.subreddit,
          ok: true,
          latency: Date.now() - start,
          statusCode: 200,
          postCount,
        };
      } catch (e: any) {
        return {
          name: source.name,
          subreddit: source.subreddit,
          ok: false,
          latency: Date.now() - start,
          statusCode: 0,
        };
      }
    })
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { name: SENTIMENT_SUBREDDITS[i].name, subreddit: SENTIMENT_SUBREDDITS[i].subreddit, ok: false, latency: 0, statusCode: 0 }
  );
}

export interface SocialSentimentResponse {
  mentions: MentionCount[];
  source: string;
  error?: string;
}

export async function handleSocialSentimentRequest(
  query: Record<string, string>,
): Promise<SocialSentimentResponse> {
  const symbol = query.symbol ? query.symbol.toUpperCase() : undefined;
  const subredditsRaw = query.subreddits || 'wallstreetbets,stocks,CryptoCurrency';
  const subreddits = subredditsRaw.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const posts = await fetchRedditPosts(subreddits);
    if (posts.length === 0) {
      return { mentions: [], source: 'none' };
    }
    const mentions = countMentions(posts, symbol);
    const result = {
      mentions,
      source: 'reddit',
    };

    // Persist to database (fire and forget)
    persistMentionsToDb(result.mentions, posts).catch(() => {});

    return result;
  } catch (err: any) {
    return { mentions: [], source: 'error', error: err.message };
  }
}
