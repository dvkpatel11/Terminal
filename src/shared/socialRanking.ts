/**
 * Signal-quality social feed ranking.
 *
 * Replaces engagement-first ranking with a score that rewards
 * clear sentiment signals from credible sources.
 *
 * score = sourceQuality * signalQuality * recencyWeight
 *
 * - sourceQuality: official/pro (1.0) > credible media (0.8) > aggregators (0.5) > anonymous (0.3)
 * - signalQuality: |sentiment.confidence| * log(engagement + 1)
 * - recencyWeight: 1.0 for <1h, 0.8 for 1-6h, 0.5 for 6-24h, 0.3 for >24h
 */

// ─── Source Quality ──────────────────────────────────────────────────────────

const SOURCE_QUALITY: Record<string, number> = {
  reddit: 0.6,
  x: 0.5,
  truth: 0.5,
  discord: 0.3,
};

const ACCOUNT_OVERRIDES: Record<string, number> = {
  // Official accounts, verified analysts, institutional sources
  // Extend as needed
};

export function getSourceQuality(platform: string, author?: string): number {
  if (author) {
    const lower = author.toLowerCase();
    for (const [key, val] of Object.entries(ACCOUNT_OVERRIDES)) {
      if (lower.includes(key)) return val;
    }
  }
  return SOURCE_QUALITY[platform] ?? 0.3;
}

// ─── Signal Quality ──────────────────────────────────────────────────────────

export interface SentimentInfo {
  confidence?: number;
  score?: number;
}

/**
 * Higher when the sentiment signal is clear (high confidence)
 * and the post has meaningful engagement.
 */
export function getSignalQuality(
  sentiment: SentimentInfo | null | undefined,
  engagementScore: number
): number {
  const confidence = sentiment?.confidence ?? 0;
  const engagement = Math.log10(Math.max(1, engagementScore));
  return confidence * engagement;
}

// ─── Recency Weight ──────────────────────────────────────────────────────────

export function getRecencyWeight(createdAt: string, now = Date.now()): number {
  const ageMs = now - new Date(createdAt).getTime();
  const ageH = ageMs / 3_600_000;
  if (ageH < 1) return 1.0;
  if (ageH < 6) return 0.8;
  if (ageH < 24) return 0.5;
  return 0.3;
}

// ─── Combined Score ──────────────────────────────────────────────────────────

export interface RankablePost {
  platform: string;
  author?: string;
  createdAt: string;
  engagementScore: number;
  sentiment?: SentimentInfo;
}

export function signalQualityScore(post: RankablePost, now = Date.now()): number {
  const sq = getSourceQuality(post.platform, post.author);
  const sig = getSignalQuality(post.sentiment, post.engagementScore);
  const rec = getRecencyWeight(post.createdAt, now);
  return sq * sig * rec;
}

/**
 * Rank posts by signal quality (descending).
 * Returns new array — does not mutate input.
 */
export function rankBySignalQuality<T extends RankablePost>(posts: T[], now = Date.now()): T[] {
  return [...posts].sort(
    (a, b) => signalQualityScore(b, now) - signalQualityScore(a, now)
  );
}
