import {
  extractTickers,
  analyzeSentiment,
  classifyContent,
  weightedScore,
  type ContentType,
} from './sentimentAnalyzer';

const FETCH_TIMEOUT = 8000;
const REDDIT_USER_AGENT = 'TerminalApp/1.0';
const TRUTH_API_BASE = 'https://truthsocial.com/api/v1';
const TWITTER_API = 'https://api.twitter.com/2';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  platform: 'reddit' | 'x' | 'truth';
  author: string;
  title: string;
  text: string;
  url: string;
  createdAt: string;
  score: number;
  engagementScore: number;
  tickers: string[];
  sentiment: { positive: number; negative: number; score: number };
  contentType: ContentType;
  thumbnail?: string;
  accountName: string;
  accountUrl: string;
}

export interface SocialFeedResponse {
  posts: SocialPost[];
  byPlatform: Record<string, SocialPost[]>;
  byAccount: SocialPost[];
  sentiment: Record<string, { positive: number; negative: number; score: number; count: number }>;
  source: string;
  error?: string;
}

export interface SocialSourceConfig {
  platform: 'reddit' | 'x' | 'truth';
  identifier: string;
  displayName: string;
  url: string;
  enabled: boolean;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 3 * 60_000;

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return Promise.resolve(entry.data as T);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// ─── URL Parser ────────────────────────────────────────────────────────────

export function parseSocialUrl(input: string): SocialSourceConfig | null {
  const trimmed = input.trim();

  // Reddit: reddit.com/r/{sub} or r/{sub}
  const redditMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)/i)
    || trimmed.match(/^r\/([a-zA-Z0-9_]+)$/i);
  if (redditMatch) {
    const sub = redditMatch[1];
    return {
      platform: 'reddit',
      identifier: sub,
      displayName: `r/${sub}`,
      url: `https://reddit.com/r/${sub}`,
      enabled: true,
    };
  }

  // X/Twitter: x.com/{handle} or twitter.com/{handle} or @handle
  const xMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/i)
    || trimmed.match(/^@([a-zA-Z0-9_]+)$/);
  if (xMatch) {
    const handle = xMatch[1];
    return {
      platform: 'x',
      identifier: handle,
      displayName: `@${handle}`,
      url: `https://x.com/${handle}`,
      enabled: true,
    };
  }

  // Truth Social: truthsocial.com/@{handle} or @handle (fallback after X check)
  const truthMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?truthsocial\.com\/@([a-zA-Z0-9_]+)/i);
  if (truthMatch) {
    const handle = truthMatch[1];
    return {
      platform: 'truth',
      identifier: handle,
      displayName: `@${handle}`,
      url: `https://truthsocial.com/@${handle}`,
      enabled: true,
    };
  }

  return null;
}

// ─── Reddit Fetcher ────────────────────────────────────────────────────────

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

export async function fetchRedditPosts(subreddits: string[]): Promise<SocialPost[]> {
  const allPosts: SocialPost[] = [];

  const results = await Promise.allSettled(
    subreddits.map(sub =>
      cached(`social-reddit-${sub}`, async () => {
        const data = await redditFetch(
          `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`
        );
        return (data.data?.children || [])
          .filter((c: any) => c.data && !c.data.stickied)
          .map((c: any): SocialPost => {
            const title = c.data.title || '';
            const body = c.data.selftext || '';
            const text = `${title} ${body}`;
            const tickers = extractTickers(text);
            const sentiment = analyzeSentiment(text);
            const contentType = classifyContent(title, body);
            const score = c.data.score || 0;
            const thumb = c.data.thumbnail?.startsWith('http') ? c.data.thumbnail : undefined;
            const preview = c.data.preview?.images?.[0]?.source?.url;
            return {
              id: `reddit-${c.data.id}`,
              platform: 'reddit',
              author: c.data.author || '[deleted]',
              title,
              text: body.slice(0, 500),
              url: c.data.url?.startsWith('http') ? c.data.url : `https://reddit.com${c.data.permalink}`,
              createdAt: new Date((c.data.created_utc || 0) * 1000).toISOString(),
              score,
              engagementScore: weightedScore(1, score, 'reddit', contentType),
              tickers: Array.from(new Set(tickers)),
              sentiment,
              contentType,
              thumbnail: preview || thumb,
              accountName: `r/${sub}`,
              accountUrl: `https://reddit.com/r/${sub}`,
            };
          });
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled') allPosts.push(...r.value);
  }
  return allPosts;
}

// ─── X/Twitter Fetcher ─────────────────────────────────────────────────────

async function fetchTwitterUserId(username: string, bearer: string): Promise<string | null> {
  try {
    const resp = await fetch(`${TWITTER_API}/users/by/username/${username}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    return data.data?.id || null;
  } catch {
    return null;
  }
}

async function fetchTwitterTweets(userId: string, bearer: string): Promise<any[]> {
  const resp = await fetch(
    `${TWITTER_API}/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    }
  );
  if (!resp.ok) throw new Error(`Twitter ${resp.status}`);
  const data = (await resp.json()) as any;
  return data.data || [];
}

export async function fetchXTweets(handles: string[]): Promise<SocialPost[]> {
  const bearer = process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) return [];

  const allPosts: SocialPost[] = [];

  const results = await Promise.allSettled(
    handles.map(handle =>
      cached(`social-x-${handle}`, async () => {
        const userId = await fetchTwitterUserId(handle, bearer);
        if (!userId) return [];
        const tweets = await fetchTwitterTweets(userId, bearer);
        return tweets.map((t: any): SocialPost => {
          const text = t.text || '';
          const tickers = extractTickers(text);
          const sentiment = analyzeSentiment(text);
          const contentType = classifyContent(text, '');
          const metrics = t.public_metrics || {};
          const likes = metrics.like_count || 0;
          const rts = metrics.retweet_count || 0;
          const score = likes + rts * 2;
          return {
            id: `x-${t.id}`,
            platform: 'x',
            author: handle,
            title: text.slice(0, 120),
            text,
            url: `https://x.com/${handle}/status/${t.id}`,
            createdAt: t.created_at || new Date().toISOString(),
            score,
            engagementScore: weightedScore(1, score, 'x', contentType),
            tickers: Array.from(new Set(tickers)),
            sentiment,
            contentType,
            accountName: `@${handle}`,
            accountUrl: `https://x.com/${handle}`,
          };
        });
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled') allPosts.push(...r.value);
  }
  return allPosts;
}

// ─── TruthSocial Fetcher ───────────────────────────────────────────────────

const TRUTH_ACCOUNT_IDS: Record<string, string> = {
  realdonaldtrump: '107966320926216192',
};

async function resolveTruthAccountId(handle: string): Promise<string | null> {
  const known = TRUTH_ACCOUNT_IDS[handle.toLowerCase()];
  if (known) return known;
  try {
    const resp = await fetch(
      `${TRUTH_API_BASE}/accounts/search?q=${encodeURIComponent(handle)}&limit=1`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as any[];
    return data[0]?.id || null;
  } catch {
    return null;
  }
}

export async function fetchTruthPosts(handles: string[]): Promise<SocialPost[]> {
  const allPosts: SocialPost[] = [];

  const results = await Promise.allSettled(
    handles.map(handle =>
      cached(`social-truth-${handle}`, async () => {
        const accountId = await resolveTruthAccountId(handle);
        if (!accountId) return [];

        const resp = await fetch(
          `${TRUTH_API_BASE}/accounts/${accountId}/statuses?limit=15&exclude_replies=true&exclude_reblogs=true`,
          { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
        );
        if (!resp.ok) throw new Error(`TruthSocial ${resp.status}`);

        const data = (await resp.json()) as any[];
        return data.map((s: any): SocialPost => {
          const text = (s.content || '').replace(/<[^>]*>/g, '');
          const title = text.slice(0, 120);
          const tickers = extractTickers(text);
          const sentiment = analyzeSentiment(text);
          const contentType = classifyContent(title, text);
          const score = (s.favorites_count || 0) + (s.reblogs_count || 0) * 2;
          return {
            id: `truth-${s.id}`,
            platform: 'truth',
            author: handle,
            title,
            text: text.slice(0, 500),
            url: s.url || `https://truthsocial.com/@${handle}/${s.id}`,
            createdAt: s.created_at || new Date().toISOString(),
            score,
            engagementScore: weightedScore(1, score, 'truth', contentType),
            tickers: Array.from(new Set(tickers)),
            sentiment,
            contentType,
            thumbnail: s.media_attachments?.[0]?.preview_url,
            accountName: `@${handle}`,
            accountUrl: `https://truthsocial.com/@${handle}`,
          };
        });
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled') allPosts.push(...r.value);
  }
  return allPosts;
}

// ─── Unified Feed ──────────────────────────────────────────────────────────

function aggregateSentiment(posts: SocialPost[]): Record<string, { positive: number; negative: number; score: number; count: number }> {
  const map: Record<string, { positive: number; negative: number; score: number; count: number }> = {};

  for (const post of posts) {
    for (const ticker of post.tickers) {
      if (!map[ticker]) {
        map[ticker] = { positive: 0, negative: 0, score: 0, count: 0 };
      }
      const entry = map[ticker];
      entry.count++;
      entry.positive += post.sentiment.positive;
      entry.negative += post.sentiment.negative;
      const total = entry.positive + entry.negative;
      entry.score = total > 0 ? Number(((entry.positive - entry.negative) / total).toFixed(3)) : 0;
    }
  }

  return map;
}

export async function getSocialFeed(config: SocialSourceConfig[]): Promise<SocialFeedResponse> {
  const enabled = config.filter(s => s.enabled);
  const byPlatform: Record<string, SocialPost[]> = {};

  const redditSources = enabled.filter(s => s.platform === 'reddit').map(s => s.identifier);
  const xSources = enabled.filter(s => s.platform === 'x').map(s => s.identifier);
  const truthSources = enabled.filter(s => s.platform === 'truth').map(s => s.identifier);

  const [redditPosts, xPosts, truthPosts] = await Promise.allSettled([
    redditSources.length ? fetchRedditPosts(redditSources) : Promise.resolve([]),
    xSources.length ? fetchXTweets(xSources) : Promise.resolve([]),
    truthSources.length ? fetchTruthPosts(truthSources) : Promise.resolve([]),
  ]);

  const allReddit = redditPosts.status === 'fulfilled' ? redditPosts.value : [];
  const allX = xPosts.status === 'fulfilled' ? xPosts.value : [];
  const allTruth = truthPosts.status === 'fulfilled' ? truthPosts.value : [];

  if (allReddit.length) byPlatform.reddit = allReddit;
  if (allX.length) byPlatform.x = allX;
  if (allTruth.length) byPlatform.truth = allTruth;

  const allPosts = [...allReddit, ...allX, ...allTruth]
    .sort((a, b) => b.engagementScore - a.engagementScore);

  const byAccount = [...allPosts].sort((a, b) => {
    if (a.accountName !== b.accountName) return a.accountName.localeCompare(b.accountName);
    return b.engagementScore - a.engagementScore;
  });

  const sentiment = aggregateSentiment(allPosts);

  return {
    posts: allPosts,
    byPlatform,
    byAccount,
    sentiment,
    source: allPosts.length > 0 ? 'live' : 'none',
  };
}
