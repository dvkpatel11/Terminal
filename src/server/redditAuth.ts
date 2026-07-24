/**
 * Shared Reddit OAuth2 client-credentials token cache.
 *
 * Reddit client_credentials tokens are valid for 1 hour. Both socialFeed.ts
 * and socialSentiment.ts previously re-fetched a fresh token on every request,
 * doubling calls to Reddit's token endpoint and risking rate-limit errors.
 *
 * This module holds one cached token in process memory, refreshes it 5 minutes
 * before expiry, and returns null when credentials are not configured so callers
 * can fall back to unauthenticated requests gracefully.
 */

import { resilientFetch } from "./providerUtils";

const REDDIT_USER_AGENT = "TerminalApp/1.0";
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

interface TokenEntry {
  token: string;
  expiresAt: number;
}

let cached: TokenEntry | null = null;
let inflight: Promise<string | null> | null = null;

/**
 * Returns a valid Reddit access token, or null if credentials are absent/fetch
 * fails. Caches the token for its lifetime (minus a 5-min buffer) and dedups
 * concurrent refresh calls via a shared promise.
 */
export async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token if still fresh.
  if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
    return cached.token;
  }

  // Deduplicate concurrent refresh calls.
  if (inflight) return inflight;

  inflight = fetchToken(clientId, clientSecret).finally(() => {
    inflight = null;
  });

  return inflight;
}

async function fetchToken(clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const resp = await resilientFetch(
      { name: "reddit", retry: { maxAttempts: 2, baseDelayMs: 1000 }, circuitBreaker: { threshold: 5, cooldownMs: 60_000 } },
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": REDDIT_USER_AGENT,
        },
        body: "grant_type=client_credentials",
      },
    );

    if (!resp.ok) {
      console.warn(`[reddit] token fetch failed: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      console.warn("[reddit] token response missing access_token");
      return null;
    }

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    const expiresInMin = Math.round(expiresIn / 60);
    console.log(`[reddit] token refreshed (expires in ${expiresInMin}m)`);
    return cached.token;
  } catch (err) {
    console.warn("[reddit] token fetch error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Clears the cached token — useful in tests. */
export function clearRedditTokenCache(): void {
  cached = null;
  inflight = null;
}
